"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const node_crypto_1 = require("node:crypto");
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = require("express-rate-limit");
const helmet_1 = __importDefault(require("helmet"));
const pino_http_1 = __importDefault(require("pino-http"));
const config_1 = require("./config");
const local_api_1 = require("./local-api");
const pool_1 = require("./db/pool");
const demo_data_1 = require("./db/demo-data");
const errors_1 = require("./errors");
const logger_1 = require("./logger");
const resources_1 = require("./resources");
const security_1 = require("./security");
const validation_1 = require("./validation");
const dummyPasswordHash = bcryptjs_1.default.hashSync((0, node_crypto_1.randomBytes)(32).toString("hex"), 10);
const asyncRoute = (handler) => (request, response, next) => {
    void handler(request, response, next).catch(next);
};
function currentUser(request) {
    if (!request.authUser)
        throw new errors_1.AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    return request.authUser;
}
function canWrite(user, resource) {
    return resources_1.writableResources[user.role].includes(resource);
}
function canCreate(user, resource) {
    return user.role !== "inspector" && canWrite(user, resource);
}
async function assertInspectorAssignment(adminId) {
    const [rows] = await pool_1.pool.execute("SELECT id FROM admins WHERE id = ? AND role = 'inspector' AND active = TRUE LIMIT 1", [adminId]);
    if (!rows[0]) {
        throw new errors_1.AppError(400, "INVALID_ASSIGNEE", "Choose an active inspection team member.");
    }
}
function validResource(value) {
    if (!(0, resources_1.isResource)(value))
        throw new errors_1.AppError(404, "NOT_FOUND", "The requested resource was not found.");
    return value;
}
function toPublicUser(row) {
    return { id: row.id, name: row.name, email: row.email, role: row.role };
}
const resourceStatusValues = {
    inspections: ["pending", "inspecting", "completed"],
    "quality-checks": ["pending", "completed", "in_correction"],
    "quick-listings": ["pending", "inspecting", "completed"],
};
const statusTables = {
    inspections: "inspections",
    "quality-checks": "quality_checks",
    "quick-listings": "quick_listings",
};
const statusColumns = {
    inspections: "status",
    "quality-checks": "status",
    "quick-listings": "inspection_status",
};
const resourceStatuses = {
    listings: ["draft", "available", "reserved", "sold", "archived"],
    buyers: ["active", "inactive", "pending"],
    sellers: ["active", "inactive", "pending"],
    "quick-listings": ["pending", "inspecting", "completed"],
    inspections: ["pending", "inspecting", "completed"],
    "quality-checks": ["pending", "completed", "in_correction"],
    repairs: ["requested", "scheduled", "in_progress", "completed", "cancelled"],
};
function createApp(authenticateRequest = security_1.authenticate, localMode = false, localStore) {
    const app = (0, express_1.default)();
    app.disable("x-powered-by");
    app.disable("etag");
    app.use((0, helmet_1.default)());
    app.use("/api", (_request, response, next) => {
        response.setHeader("Cache-Control", "no-store");
        next();
    });
    app.use((0, cors_1.default)({
        origin: config_1.config.WEB_ORIGIN,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }));
    app.use(express_1.default.json({ limit: "1mb" }));
    app.use((0, cookie_parser_1.default)());
    app.use((0, pino_http_1.default)({
        logger: logger_1.logger,
        genReqId: () => (0, node_crypto_1.randomUUID)(),
        serializers: {
            req: (request) => ({
                id: request.id,
                method: request.method,
                path: new URL(request.url, "http://localhost").pathname,
            }),
            res: (response) => ({
                statusCode: response.statusCode,
            }),
        },
        customSuccessMessage: (request, response, responseTime) => `${request.method} ${new URL(request.url, "http://localhost").pathname} ${response.statusCode} ${Math.round(responseTime)}ms`,
        customErrorMessage: (request, response) => `${request.method} ${new URL(request.url, "http://localhost").pathname} ${response.statusCode} failed`,
    }));
    const loginLimiter = (0, express_rate_limit_1.rateLimit)({
        windowMs: 15 * 60 * 1000,
        limit: 8,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: {
            error: {
                code: "RATE_LIMITED",
                message: "Too many sign-in attempts. Try again later.",
            },
        },
    });
    if (localMode) {
        app.get("/health", (_request, response) => response.json({ status: "ok" }));
        app.use("/api", (0, local_api_1.createLocalApi)(loginLimiter, localStore));
        app.use("/api", errors_1.notFound);
        app.use(errors_1.notFound);
        app.use(errors_1.errorHandler);
        return app;
    }
    const api = express_1.default.Router();
    api.post("/auth/login", loginLimiter, asyncRoute(async (request, response) => {
        const origin = request.get("origin");
        let validOrigin = false;
        try {
            validOrigin = Boolean(origin && new URL(origin).origin === config_1.config.WEB_ORIGIN);
        }
        catch {
            validOrigin = false;
        }
        if (!validOrigin) {
            throw new errors_1.AppError(403, "ORIGIN_INVALID", "The sign-in request could not be verified.");
        }
        const input = validation_1.loginSchema.parse(request.body);
        const [rows] = await pool_1.pool.execute("SELECT id, name, email, role, password_hash FROM admins WHERE email = ? AND active = TRUE LIMIT 1", [input.email]);
        const account = rows[0];
        const valid = await bcryptjs_1.default.compare(input.password, account?.password_hash ?? dummyPasswordHash);
        if (!account || !valid) {
            throw new errors_1.AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
        }
        const session = await (0, security_1.createSession)(account.id, input.rememberMe);
        (0, security_1.setSessionCookies)(response, session.id, session.csrf, input.rememberMe);
        response
            .status(200)
            .json({
            user: toPublicUser(account),
            csrfToken: session.csrf,
            sessionToken: session.id,
        });
    }));
    api.use(asyncRoute(async (request, _response, next) => {
        await authenticateRequest(request);
        next();
    }));
    api.post("/demo-data/seed", asyncRoute(async (request, response) => {
        const user = currentUser(request);
        (0, security_1.requireRoles)("admin")(user);
        await (0, demo_data_1.seedMysqlDemoData)(user.id);
        response.json({ message: "Synthetic demo data is ready." });
    }));
    api.get("/auth/me", (request, response) => response.json({
        user: currentUser(request),
        csrfToken: request.authCsrfToken ?? "",
        sessionToken: request.authSessionToken ?? (0, security_1.bearerSessionToken)(request) ?? "",
    }));
    api.put("/auth/profile", asyncRoute(async (request, response) => {
        const user = currentUser(request);
        const input = validation_1.profileUpdateSchema.parse(request.body);
        const [rows] = await pool_1.pool.execute("SELECT password_hash FROM admins WHERE id = ? AND active = TRUE LIMIT 1", [user.id]);
        if (!rows[0])
            throw new errors_1.AppError(401, "UNAUTHENTICATED", "Your account is no longer active.");
        let passwordHash;
        if (input.newPassword) {
            const validPassword = input.currentPassword
                ? await bcryptjs_1.default.compare(input.currentPassword, rows[0].password_hash)
                : false;
            if (!validPassword)
                throw new errors_1.AppError(400, "CURRENT_PASSWORD_INVALID", "Current password is incorrect.");
            passwordHash = await bcryptjs_1.default.hash(input.newPassword, 12);
        }
        try {
            if (passwordHash) {
                await pool_1.pool.execute("UPDATE admins SET name = ?, email = ?, password_hash = ? WHERE id = ?", [input.name, input.email, passwordHash, user.id]);
                const rawSession = request.cookies?.[security_1.SESSION_COOKIE];
                if (rawSession) {
                    await pool_1.pool.execute("DELETE FROM auth_sessions WHERE admin_id = ? AND id <> ?", [user.id, (0, security_1.hashToken)(rawSession)]);
                }
            }
            else {
                await pool_1.pool.execute("UPDATE admins SET name = ?, email = ? WHERE id = ?", [input.name, input.email, user.id]);
            }
        }
        catch (error) {
            if (typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === "ER_DUP_ENTRY") {
                throw new errors_1.AppError(409, "EMAIL_IN_USE", "That email address is already in use.");
            }
            throw error;
        }
        response.json({
            user: { ...user, name: input.name, email: input.email },
        });
    }));
    api.post("/auth/logout", asyncRoute(async (request, response) => {
        const rawId = (0, security_1.bearerSessionToken)(request) ??
            request.cookies?.[security_1.SESSION_COOKIE];
        if (rawId)
            await pool_1.pool.execute("DELETE FROM auth_sessions WHERE id = ?", [
                (0, security_1.hashToken)(rawId),
            ]);
        (0, security_1.clearSessionCookies)(response);
        response.status(204).end();
    }));
    api.get("/dashboard", asyncRoute(async (_request, response) => {
        const user = currentUser(_request);
        if (user.role === "inspector") {
            const [assigned] = await pool_1.pool.execute(`SELECT
          (SELECT COUNT(*) FROM inspections WHERE assigned_to = ? AND status = 'pending') AS pending_inspections,
          (SELECT COUNT(*) FROM quality_checks WHERE assigned_to = ? AND status = 'pending') AS pending_quality_checks`, [user.id, user.id]);
            response.json({
                listings: 0,
                soldListings: 0,
                availableListings: 0,
                dealers: 0,
                buyers: 0,
                sellers: 0,
                quickListings: 0,
                repairs: 0,
                pendingInspections: Number(assigned[0].pending_inspections),
                pendingQualityChecks: Number(assigned[0].pending_quality_checks),
                pendingApprovals: 0,
            });
            return;
        }
        const [listings] = await pool_1.pool.execute("SELECT status, COUNT(*) AS count FROM listings GROUP BY status");
        const [counts] = await pool_1.pool.execute(`SELECT
        (SELECT COUNT(*) FROM dealers) AS dealers,
        (SELECT COUNT(*) FROM buyers) AS buyers,
        (SELECT COUNT(*) FROM sellers) AS sellers,
        (SELECT COUNT(*) FROM quick_listings) AS quick_listings,
        (SELECT COUNT(*) FROM repairs) AS repairs,
        (SELECT COUNT(*) FROM inspections WHERE status = 'pending') AS pending_inspections,
        (SELECT COUNT(*) FROM quality_checks WHERE status = 'pending') AS pending_quality_checks,
        (SELECT COUNT(*) FROM status_change_requests WHERE status = 'pending') AS pending_approvals`);
        const values = counts[0];
        response.json({
            listings: listings.reduce((total, row) => total + Number(row.count), 0),
            soldListings: Number(listings.find((row) => row.status === "sold")?.count ?? 0),
            availableListings: Number(listings.find((row) => row.status === "available")?.count ?? 0),
            dealers: Number(values.dealers),
            buyers: Number(values.buyers),
            sellers: Number(values.sellers),
            quickListings: Number(values.quick_listings),
            repairs: Number(values.repairs),
            pendingInspections: Number(values.pending_inspections),
            pendingQualityChecks: Number(values.pending_quality_checks),
            pendingApprovals: Number(values.pending_approvals),
        });
    }));
    api.get("/staff", asyncRoute(async (request, response) => {
        (0, security_1.requireRoles)("admin", "operations")(currentUser(request));
        const [staff] = await pool_1.pool.execute("SELECT id, name, role FROM admins WHERE active = TRUE AND role = 'inspector' ORDER BY name");
        response.json({ data: staff });
    }));
    api.get("/status-requests", asyncRoute(async (request, response) => {
        const user = currentUser(request);
        (0, security_1.requireRoles)("admin")(user);
        const [rows] = await pool_1.pool.execute(`SELECT r.id, r.resource, r.resource_id AS resourceId, r.from_status AS fromStatus,
        r.to_status AS toStatus, r.note, r.status, a.name AS requestedBy, r.created_at AS requestedAt
       FROM status_change_requests r JOIN admins a ON a.id = r.requested_by
       ORDER BY r.created_at DESC LIMIT 200`);
        response.json({ data: rows });
    }));
    api.post("/status-requests", asyncRoute(async (request, response) => {
        const user = currentUser(request);
        const input = validation_1.statusRequestSchema.parse(request.body);
        if (!resourceStatusValues[input.resource].includes(input.toStatus)) {
            throw new errors_1.AppError(400, "INVALID_STATUS", "The requested status is not valid for this workflow.");
        }
        const table = statusTables[input.resource];
        const column = statusColumns[input.resource];
        const connection = await pool_1.pool.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.execute(`SELECT ${column} AS status, assigned_to FROM ${table} WHERE id = ? FOR UPDATE`, [input.resourceId]);
            if (!rows[0])
                throw new errors_1.AppError(404, "NOT_FOUND", "The workflow record was not found.");
            if (user.role === "inspector" && rows[0].assigned_to !== user.id) {
                throw new errors_1.AppError(404, "NOT_FOUND", "The workflow record was not found.");
            }
            if (rows[0].status === input.toStatus) {
                throw new errors_1.AppError(409, "STATUS_UNCHANGED", "The record already has that status.");
            }
            const [pending] = await connection.execute("SELECT id FROM status_change_requests WHERE resource = ? AND resource_id = ? AND status = 'pending' LIMIT 1", [input.resource, input.resourceId]);
            if (pending.length)
                throw new errors_1.AppError(409, "APPROVAL_PENDING", "A status change is already awaiting approval.");
            const [result] = await connection.execute(`INSERT INTO status_change_requests
          (resource, resource_id, from_status, to_status, note, requested_by)
         VALUES (?, ?, ?, ?, ?, ?)`, [
                input.resource,
                input.resourceId,
                rows[0].status,
                input.toStatus,
                input.note ?? null,
                user.id,
            ]);
            await connection.commit();
            response.status(201).json({ id: result.insertId, status: "pending" });
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }));
    api.patch("/status-requests/:id", asyncRoute(async (request, response) => {
        const user = currentUser(request);
        (0, security_1.requireRoles)("admin")(user);
        const requestId = Number(request.params.id);
        if (!Number.isSafeInteger(requestId) || requestId < 1) {
            throw new errors_1.AppError(400, "VALIDATION_ERROR", "Approval ID must be a positive integer.");
        }
        const { decision } = validation_1.reviewRequestSchema.parse(request.body);
        const connection = await pool_1.pool.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.execute("SELECT resource, resource_id, from_status, to_status, status FROM status_change_requests WHERE id = ? FOR UPDATE", [requestId]);
            const item = rows[0];
            if (!item)
                throw new errors_1.AppError(404, "NOT_FOUND", "The approval request was not found.");
            if (item.status !== "pending")
                throw new errors_1.AppError(409, "ALREADY_REVIEWED", "This request has already been reviewed.");
            if (decision === "approved") {
                const table = statusTables[item.resource];
                const column = statusColumns[item.resource];
                const [updated] = await connection.execute(`UPDATE ${table} SET ${column} = ? WHERE id = ? AND ${column} = ?`, [item.to_status, item.resource_id, item.from_status]);
                if (!updated.affectedRows) {
                    throw new errors_1.AppError(409, "RECORD_CHANGED", "The record changed before this request was approved.");
                }
            }
            await connection.execute("UPDATE status_change_requests SET status = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?", [decision, user.id, requestId]);
            await connection.commit();
            response.json({ id: requestId, status: decision });
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }));
    api.get("/:resource", asyncRoute(async (request, response) => {
        const user = currentUser(request);
        const resource = validResource(request.params.resource);
        if (user.role === "inspector" && !canWrite(user, resource)) {
            throw new errors_1.AppError(403, "FORBIDDEN", "You do not have permission to view this resource.");
        }
        const configForResource = resources_1.resourceConfig[resource];
        const query = validation_1.listQuerySchema.parse(request.query);
        if (!configForResource.sortable.includes(query.sort)) {
            throw new errors_1.AppError(400, "INVALID_SORT", "The requested sort field is not supported.");
        }
        if (query.status && !resourceStatuses[resource]?.includes(query.status)) {
            throw new errors_1.AppError(400, "INVALID_STATUS", "The requested status filter is not supported.");
        }
        const sort = query.sort;
        const where = [];
        const values = [];
        if (user.role === "inspector") {
            where.push(`\`${configForResource.table}\`.\`assigned_to\` = ?`);
            values.push(user.id);
        }
        if (query.q) {
            where.push(`(${configForResource.searchable.map((column) => `\`${configForResource.table}\`.\`${column}\` LIKE ?`).join(" OR ")})`);
            for (let index = 0; index < configForResource.searchable.length; index += 1) {
                values.push(`%${query.q}%`);
            }
        }
        const statusColumn = resource === "quick-listings" ? "inspection_status" : "status";
        if (query.status && configForResource.columns.includes(statusColumn)) {
            where.push(`\`${configForResource.table}\`.\`${statusColumn}\` = ?`);
            values.push(query.status);
        }
        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const offset = (query.page - 1) * query.pageSize;
        const staffJoin = configForResource.columns.includes("assigned_to")
            ? `LEFT JOIN admins AS assigned_staff ON assigned_staff.id = \`${configForResource.table}\`.assigned_to`
            : "";
        const staffName = staffJoin
            ? ", assigned_staff.name AS assigned_to_name"
            : "";
        const selectedColumns = configForResource.columns
            .map((column) => `\`${configForResource.table}\`.\`${column}\``)
            .join(", ");
        const [data] = await pool_1.pool.execute(`SELECT ${selectedColumns}${staffName}
       FROM \`${configForResource.table}\` ${staffJoin} ${whereSql}
       ORDER BY \`${configForResource.table}\`.\`${sort}\` ${query.direction.toUpperCase()}, \`${configForResource.table}\`.id DESC LIMIT ? OFFSET ?`, [...values, query.pageSize, offset]);
        const [count] = await pool_1.pool.execute(`SELECT COUNT(*) AS total FROM \`${configForResource.table}\` ${staffJoin} ${whereSql}`, values);
        response.json({
            data,
            page: query.page,
            pageSize: query.pageSize,
            total: Number(count[0].total),
        });
    }));
    api.get("/:resource/:id", asyncRoute(async (request, response) => {
        const user = currentUser(request);
        const resource = validResource(request.params.resource);
        if (user.role === "inspector" && !canWrite(user, resource)) {
            throw new errors_1.AppError(403, "FORBIDDEN", "You do not have permission to view this resource.");
        }
        const configForResource = resources_1.resourceConfig[resource];
        const id = Number(request.params.id);
        if (!Number.isSafeInteger(id) || id < 1)
            throw new errors_1.AppError(400, "VALIDATION_ERROR", "Record ID is invalid.");
        const scopeSql = user.role === "inspector"
            ? ` AND \`${configForResource.table}\`.assigned_to = ?`
            : "";
        const parameters = user.role === "inspector" ? [id, user.id] : [id];
        const staffJoin = configForResource.columns.includes("assigned_to")
            ? `LEFT JOIN admins AS assigned_staff ON assigned_staff.id = \`${configForResource.table}\`.assigned_to`
            : "";
        const staffName = staffJoin
            ? ", assigned_staff.name AS assigned_to_name"
            : "";
        const [rows] = await pool_1.pool.execute(`SELECT ${configForResource.columns.map((column) => `\`${configForResource.table}\`.\`${column}\``).join(", ")}${staffName}
       FROM \`${configForResource.table}\` ${staffJoin}
       WHERE \`${configForResource.table}\`.id = ?${scopeSql} LIMIT 1`, parameters);
        if (!rows[0])
            throw new errors_1.AppError(404, "NOT_FOUND", "The record was not found.");
        response.json({ data: rows[0] });
    }));
    api.post("/:resource", asyncRoute(async (request, response) => {
        const user = currentUser(request);
        const resource = validResource(request.params.resource);
        if (!canCreate(user, resource))
            throw new errors_1.AppError(403, "FORBIDDEN", "You do not have permission to create this record.");
        const input = (0, resources_1.schemaFor)(resource).parse(request.body);
        if (typeof input.assigned_to === "number")
            await assertInspectorAssignment(input.assigned_to);
        const fields = Object.keys(input);
        const values = fields.map((field) => field === "features" ? JSON.stringify(input[field]) : input[field]);
        const [result] = await pool_1.pool.execute(`INSERT INTO \`${resources_1.resourceConfig[resource].table}\`
       (${fields.map((field) => `\`${field}\``).join(", ")})
       VALUES (${fields.map(() => "?").join(", ")})`, values);
        response.status(201).json({ id: result.insertId });
    }));
    api.put("/:resource/:id", asyncRoute(async (request, response) => {
        const user = currentUser(request);
        const resource = validResource(request.params.resource);
        if (!canWrite(user, resource))
            throw new errors_1.AppError(403, "FORBIDDEN", "You do not have permission to edit this record.");
        const id = Number(request.params.id);
        if (!Number.isSafeInteger(id) || id < 1)
            throw new errors_1.AppError(400, "VALIDATION_ERROR", "Record ID is invalid.");
        const input = (0, resources_1.schemaFor)(resource).partial().parse(request.body);
        const fields = Object.keys(input);
        if (!fields.length)
            throw new errors_1.AppError(400, "VALIDATION_ERROR", "At least one field is required.");
        if (user.role === "inspector") {
            const allowedFields = resource === "inspections" ? ["notes"] : ["findings"];
            if (fields.some((field) => !allowedFields.includes(field))) {
                throw new errors_1.AppError(403, "FORBIDDEN", "Inspectors may update only their assigned workflow notes.");
            }
        }
        if (typeof input.assigned_to === "number")
            await assertInspectorAssignment(input.assigned_to);
        const values = fields.map((field) => field === "features" ? JSON.stringify(input[field]) : input[field]);
        const scopeSql = user.role === "inspector" ? " AND assigned_to = ?" : "";
        const [result] = await pool_1.pool.execute(`UPDATE \`${resources_1.resourceConfig[resource].table}\`
       SET ${fields.map((field) => `\`${field}\` = ?`).join(", ")}
       WHERE id = ?${scopeSql}`, user.role === "inspector" ? [...values, id, user.id] : [...values, id]);
        if (!result.affectedRows)
            throw new errors_1.AppError(404, "NOT_FOUND", "The record was not found.");
        response.status(204).end();
    }));
    api.delete("/:resource/:id", asyncRoute(async (request, response) => {
        const user = currentUser(request);
        (0, security_1.requireRoles)("admin")(user);
        const resource = validResource(request.params.resource);
        const id = Number(request.params.id);
        if (!Number.isSafeInteger(id) || id < 1)
            throw new errors_1.AppError(400, "VALIDATION_ERROR", "Record ID is invalid.");
        const [result] = await pool_1.pool.execute(`DELETE FROM \`${resources_1.resourceConfig[resource].table}\` WHERE id = ?`, [id]);
        if (!result.affectedRows)
            throw new errors_1.AppError(404, "NOT_FOUND", "The record was not found.");
        response.status(204).end();
    }));
    app.get("/health", (_request, response) => response.json({ status: "ok" }));
    app.use("/api", api);
    app.use("/api", errors_1.notFound);
    app.use(errors_1.notFound);
    app.use(errors_1.errorHandler);
    return app;
}
