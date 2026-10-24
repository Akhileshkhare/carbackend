"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CSRF_COOKIE = exports.SESSION_COOKIE = void 0;
exports.hashToken = hashToken;
exports.setSessionCookies = setSessionCookies;
exports.clearSessionCookies = clearSessionCookies;
exports.createOpaqueToken = createOpaqueToken;
exports.createSession = createSession;
exports.authenticate = authenticate;
exports.requireRoles = requireRoles;
const node_crypto_1 = require("node:crypto");
const pool_1 = require("./db/pool");
const errors_1 = require("./errors");
const config_1 = require("./config");
exports.SESSION_COOKIE = "cc_session";
exports.CSRF_COOKIE = "cc_csrf";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function hashToken(token) {
    return (0, node_crypto_1.createHash)("sha256").update(token).digest("hex");
}
function setSessionCookies(response, sessionId, csrf, rememberMe) {
    const secure = config_1.config.COOKIE_SECURE === "true";
    const common = {
        secure,
        sameSite: config_1.config.COOKIE_SAME_SITE,
        path: "/",
    };
    const maxAge = rememberMe ? REMEMBER_SESSION_TTL_MS : undefined;
    response.cookie(exports.SESSION_COOKIE, sessionId, {
        ...common,
        httpOnly: true,
        ...(maxAge ? { maxAge } : {}),
    });
    response.cookie(exports.CSRF_COOKIE, csrf, {
        ...common,
        httpOnly: false,
        ...(maxAge ? { maxAge } : {}),
    });
}
function clearSessionCookies(response) {
    const secure = config_1.config.COOKIE_SECURE === "true";
    const common = {
        secure,
        sameSite: config_1.config.COOKIE_SAME_SITE,
        path: "/",
    };
    response.clearCookie(exports.SESSION_COOKIE, { ...common, httpOnly: true });
    response.clearCookie(exports.CSRF_COOKIE, { ...common, httpOnly: false });
}
function createOpaqueToken() {
    return (0, node_crypto_1.randomBytes)(32).toString("hex");
}
async function createSession(adminId, rememberMe) {
    const id = createOpaqueToken();
    const csrf = createOpaqueToken();
    const expiresAt = new Date(Date.now() + (rememberMe ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS));
    await pool_1.pool.execute("DELETE FROM auth_sessions WHERE expires_at <= UTC_TIMESTAMP()");
    await pool_1.pool.execute("INSERT INTO auth_sessions (id, admin_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)", [hashToken(id), adminId, csrf, expiresAt]);
    return { id, csrf };
}
async function authenticate(request) {
    const rawId = request.cookies?.[exports.SESSION_COOKIE];
    if (!rawId || !/^[a-f0-9]{64}$/.test(rawId)) {
        throw new errors_1.AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    }
    const [rows] = await pool_1.pool.execute(`SELECT a.id, a.name, a.email, a.role, s.csrf_token, s.expires_at
     FROM auth_sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.id = ? AND a.active = TRUE AND s.expires_at > UTC_TIMESTAMP() LIMIT 1`, [hashToken(rawId)]);
    const session = rows[0];
    if (!session)
        throw new errors_1.AppError(401, "SESSION_EXPIRED", "Your session has expired. Sign in again.");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        const cookieCsrf = request.cookies?.[exports.CSRF_COOKIE];
        const headerCsrf = request.get("x-csrf-token");
        if (!cookieCsrf ||
            !headerCsrf ||
            cookieCsrf !== session.csrf_token ||
            headerCsrf !== session.csrf_token) {
            throw new errors_1.AppError(403, "CSRF_INVALID", "The request could not be verified. Refresh and try again.");
        }
    }
    request.authUser = {
        id: session.id,
        name: session.name,
        email: session.email,
        role: session.role,
    };
    request.authCsrfToken = session.csrf_token;
    return request.authUser;
}
function requireRoles(...roles) {
    return (user) => {
        if (!roles.includes(user.role)) {
            throw new errors_1.AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
        }
    };
}
