import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import express from "express";
import type { AuthUser, ResourceName } from "../shared/contracts";
import { config } from "./config";
import { AppError } from "./errors";
import {
  localAdminUser,
  localStore,
  type LocalDatabase,
  type LocalRecord,
} from "./db/local-store";
import { logger } from "./logger";
import { resourceConfig, isResource, schemaFor, writableResources } from "./resources";
import {
  clearSessionCookies,
  createOpaqueToken,
  hashToken,
  SESSION_COOKIE,
  setSessionCookies,
  CSRF_COOKIE,
} from "./security";
import {
  listQuerySchema,
  loginSchema,
  profileUpdateSchema,
  reviewRequestSchema,
  statusRequestSchema,
} from "./validation";

type AsyncHandler = (
  request: Request,
  response: Response,
  next: (error?: unknown) => void,
) => Promise<void>;

const asyncRoute =
  (handler: AsyncHandler): RequestHandler =>
  (request, response, next) => {
    void handler(request, response, next).catch(next);
  };

const dummyPasswordHash = bcrypt.hashSync(randomBytes(32).toString("hex"), 10);

function currentUser(request: Request): AuthUser {
  if (!request.authUser) {
    throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }
  return request.authUser;
}

function validResource(value: string): ResourceName {
  if (!isResource(value)) {
    throw new AppError(404, "NOT_FOUND", "The requested resource was not found.");
  }
  return value;
}

function canWrite(user: AuthUser, resource: ResourceName): boolean {
  return writableResources[user.role].includes(resource);
}

function canCreate(user: AuthUser, resource: ResourceName): boolean {
  return user.role !== "inspector" && canWrite(user, resource);
}

function positiveId(value: string, label = "Record ID"): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new AppError(400, "VALIDATION_ERROR", `${label} must be a positive integer.`);
  }
  return id;
}

function assignedToName(database: LocalDatabase, record: LocalRecord) {
  if (!("assigned_to" in record)) return record;
  const assigned = database.admins.find((admin) => admin.id === record.assigned_to);
  return { ...record, assigned_to_name: assigned?.name ?? null };
}

function statusColumn(resource: ResourceName): "status" | "inspection_status" {
  return resource === "quick-listings" ? "inspection_status" : "status";
}

const statusValues: Record<
  "inspections" | "quality-checks" | "quick-listings",
  readonly string[]
> = {
  inspections: ["pending", "inspecting", "completed"],
  "quality-checks": ["pending", "completed", "in_correction"],
  "quick-listings": ["pending", "inspecting", "completed"],
};
const supportedResourceStatuses: Partial<Record<ResourceName, readonly string[]>> = {
  listings: ["draft", "available", "reserved", "sold", "archived"],
  buyers: ["active", "inactive", "pending"],
  sellers: ["active", "inactive", "pending"],
  "quick-listings": ["pending", "inspecting", "completed"],
  inspections: ["pending", "inspecting", "completed"],
  "quality-checks": ["pending", "completed", "in_correction"],
  repairs: ["requested", "scheduled", "in_progress", "completed", "cancelled"],
};

function requireAssignee(database: LocalDatabase, assigneeId: number): void {
  const staff = database.admins.find(
    (admin) => admin.id === assigneeId && admin.role === "inspector" && admin.active,
  );
  if (!staff) {
    throw new AppError(400, "INVALID_ASSIGNEE", "Choose an active inspection team member.");
  }
}

function assertReferences(
  database: LocalDatabase,
  resource: ResourceName,
  values: Record<string, unknown>,
): void {
  const references: Partial<Record<ResourceName, Record<string, ResourceName>>> = {
    listings: { seller_id: "sellers" },
    inspections: {
      listing_id: "listings",
      quick_listing_id: "quick-listings",
    },
    "quality-checks": {
      inspection_id: "inspections",
      listing_id: "listings",
    },
  };
  for (const [field, target] of Object.entries(references[resource] ?? {})) {
    const id = values[field];
    if (
      id !== undefined &&
      id !== null &&
      !database.records[target].some((record) => record.id === id)
    ) {
      throw new AppError(
        400,
        "RELATED_RECORD_NOT_FOUND",
        "A referenced record does not exist.",
      );
    }
  }
}

function duplicateRecord(
  database: LocalDatabase,
  resource: ResourceName,
  values: Record<string, unknown>,
  exceptId?: number,
): boolean {
  const uniqueFields: Partial<Record<ResourceName, readonly string[]>> = {
    listings: ["registration_no", "ref_id"],
    dealers: ["email"],
    buyers: ["email"],
    sellers: ["email"],
    "quick-listings": ["ref_id"],
    inspections: ["ref_id"],
    "quality-checks": ["ref_id"],
  };
  return (uniqueFields[resource] ?? []).some((field) => {
    if (!(field in values)) return false;
    return database.records[resource].some(
      (record) =>
        record.id !== exceptId &&
        String(record[field]).toLowerCase() === String(values[field]).toLowerCase(),
    );
  });
}

export function createLocalApi(
  loginLimiter: RequestHandler,
  store = localStore,
): express.Router {
  const api = express.Router();

  api.post(
    "/auth/login",
    loginLimiter,
    asyncRoute(async (request, response) => {
      const origin = request.get("origin");
      let validOrigin = false;
      try {
        validOrigin = Boolean(origin && new URL(origin).origin === config.WEB_ORIGIN);
      } catch {
        validOrigin = false;
      }
      if (!validOrigin) {
        throw new AppError(403, "ORIGIN_INVALID", "The sign-in request could not be verified.");
      }
      const input = loginSchema.parse(request.body);
      const admin = await store.get((database) =>
        database.admins.find(
          (item) => item.email === input.email && item.active,
        ),
      );
      const valid = await bcrypt.compare(
        input.password,
        admin?.passwordHash ?? dummyPasswordHash,
      );
      if (!admin || !valid) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      }

      const rawId = createOpaqueToken();
      const csrf = createOpaqueToken();
      const expiresAt =
        Date.now() + (input.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000);
      await store.update((database) => {
        database.sessions = database.sessions.filter(
          (session) => session.expiresAt > Date.now(),
        );
        database.sessions.push({
          id: hashToken(rawId),
          adminId: admin.id,
          csrfToken: csrf,
          expiresAt,
        });
      });
      setSessionCookies(response, rawId, csrf, input.rememberMe);
      response.status(200).json({ user: localAdminUser(admin), csrfToken: csrf });
    }),
  );

  api.use(
    asyncRoute(async (request, _response, next) => {
      const rawId = request.cookies?.[SESSION_COOKIE] as string | undefined;
      if (!rawId || !/^[a-f0-9]{64}$/.test(rawId)) {
        throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
      }
      const session = await store.get((database) => {
        const found = database.sessions.find(
          (item) => item.id === hashToken(rawId) && item.expiresAt > Date.now(),
        );
        const admin = found
          ? database.admins.find(
              (item) => item.id === found.adminId && item.active,
            )
          : undefined;
        return found && admin ? { session: found, admin } : undefined;
      });
      if (!session) {
        throw new AppError(401, "SESSION_EXPIRED", "Your session has expired. Sign in again.");
      }
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        const cookieCsrf = request.cookies?.[CSRF_COOKIE] as string | undefined;
        const headerCsrf = request.get("x-csrf-token");
        if (
          !cookieCsrf ||
          !headerCsrf ||
          cookieCsrf !== session.session.csrfToken ||
          headerCsrf !== session.session.csrfToken
        ) {
          throw new AppError(
            403,
            "CSRF_INVALID",
            "The request could not be verified. Refresh and try again.",
          );
        }
      }
      request.authUser = localAdminUser(session.admin);
      request.authCsrfToken = session.session.csrfToken;
      next();
    }),
  );

  api.get("/auth/me", (request, response) =>
    response.json({
      user: currentUser(request),
      csrfToken: request.authCsrfToken ?? "",
    }),
  );

  api.put(
    "/auth/profile",
    asyncRoute(async (request, response) => {
      const user = currentUser(request);
      const input = profileUpdateSchema.parse(request.body);
      const rawSession = request.cookies?.[SESSION_COOKIE] as string;
      const updatedUser = await store.update(async (database) => {
        const admin = database.admins.find(
          (item) => item.id === user.id && item.active,
        );
        if (!admin) {
          throw new AppError(401, "UNAUTHENTICATED", "Your account is no longer active.");
        }
        let passwordHash: string | undefined;
        if (input.newPassword) {
          if (
            !input.currentPassword ||
            !(await bcrypt.compare(input.currentPassword, admin.passwordHash))
          ) {
            throw new AppError(
              400,
              "CURRENT_PASSWORD_INVALID",
              "Current password is incorrect.",
            );
          }
          passwordHash = await bcrypt.hash(input.newPassword, 12);
        }
        const conflicting = database.admins.some(
          (item) => item.id !== user.id && item.email === input.email,
        );
        if (conflicting) {
          throw new AppError(409, "EMAIL_IN_USE", "That email address is already in use.");
        }
        admin.name = input.name;
        admin.email = input.email;
        if (passwordHash) {
          admin.passwordHash = passwordHash;
          database.sessions = database.sessions.filter(
            (session) =>
              session.adminId !== user.id || session.id === hashToken(rawSession),
          );
        }
        return localAdminUser(admin);
      });
      response.json({ user: updatedUser });
    }),
  );

  api.post(
    "/auth/logout",
    asyncRoute(async (request, response) => {
      const rawId = request.cookies?.[SESSION_COOKIE] as string | undefined;
      if (rawId) {
        await store.update((database) => {
          database.sessions = database.sessions.filter(
            (session) => session.id !== hashToken(rawId),
          );
        });
      }
      clearSessionCookies(response);
      response.status(204).end();
    }),
  );

  api.get(
    "/dashboard",
    asyncRoute(async (request, response) => {
      const user = currentUser(request);
      const counts = await store.get((database) => {
        const count = (resource: ResourceName, status?: string) =>
          database.records[resource].filter((record) => {
            const key = statusColumn(resource);
            return (
              (!status || record[key] === status) &&
              (user.role !== "inspector" || record.assigned_to === user.id)
            );
          }).length;
        if (user.role === "inspector") {
          return {
            listings: 0,
            soldListings: 0,
            availableListings: 0,
            dealers: 0,
            buyers: 0,
            sellers: 0,
            quickListings: 0,
            repairs: 0,
            pendingInspections: count("inspections", "pending"),
            pendingQualityChecks: count("quality-checks", "pending"),
            pendingApprovals: 0,
          };
        }
        const listings = database.records.listings;
        return {
          listings: listings.length,
          soldListings: listings.filter((record) => record.status === "sold").length,
          availableListings: listings.filter((record) => record.status === "available").length,
          dealers: count("dealers"),
          buyers: count("buyers"),
          sellers: count("sellers"),
          quickListings: count("quick-listings"),
          repairs: count("repairs"),
          pendingInspections: count("inspections", "pending"),
          pendingQualityChecks: count("quality-checks", "pending"),
          pendingApprovals: database.statusRequests.filter(
            (item) => item.status === "pending",
          ).length,
        };
      });
      response.json(counts);
    }),
  );

  api.get(
    "/staff",
    asyncRoute(async (request, response) => {
      const user = currentUser(request);
      if (!["admin", "operations"].includes(user.role)) {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
      }
      const data = await store.get((database) =>
        database.admins
          .filter((admin) => admin.active && admin.role === "inspector")
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(({ id, name, role }) => ({ id, name, role })),
      );
      response.json({ data });
    }),
  );

  api.get(
    "/status-requests",
    asyncRoute(async (request, response) => {
      if (currentUser(request).role !== "admin") {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
      }
      const data = await store.get((database) =>
        database.statusRequests
          .slice()
          .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
          .slice(0, 200)
          .map((item) => ({
            id: item.id,
            resource: item.resource,
            resourceId: item.resourceId,
            fromStatus: item.fromStatus,
            toStatus: item.toStatus,
            note: item.note,
            status: item.status,
            requestedBy:
              database.admins.find((admin) => admin.id === item.requestedBy)?.name ??
              "Unknown",
            requestedAt: item.requestedAt,
          })),
      );
      response.json({ data });
    }),
  );

  api.post(
    "/status-requests",
    asyncRoute(async (request, response) => {
      const user = currentUser(request);
      const input = statusRequestSchema.parse(request.body);
      if (!statusValues[input.resource].includes(input.toStatus)) {
        throw new AppError(400, "INVALID_STATUS", "The requested status is not valid for this workflow.");
      }
      const result = await store.update((database) => {
        const record = database.records[input.resource].find(
          (item) => item.id === input.resourceId,
        );
        if (!record || (user.role === "inspector" && record.assigned_to !== user.id)) {
          throw new AppError(404, "NOT_FOUND", "The workflow record was not found.");
        }
        const column = statusColumn(input.resource);
        const fromStatus = String(record[column]);
        if (fromStatus === input.toStatus) {
          throw new AppError(409, "STATUS_UNCHANGED", "The record already has that status.");
        }
        if (
          database.statusRequests.some(
            (item) =>
              item.resource === input.resource &&
              item.resourceId === input.resourceId &&
              item.status === "pending",
          )
        ) {
          throw new AppError(409, "APPROVAL_PENDING", "A status change is already awaiting approval.");
        }
        const id = store.nextId(database, "statusRequests");
        database.statusRequests.push({
          id,
          resource: input.resource,
          resourceId: input.resourceId,
          fromStatus,
          toStatus: input.toStatus,
          note: input.note ?? null,
          status: "pending",
          requestedBy: user.id,
          reviewedBy: null,
          requestedAt: new Date().toISOString(),
          reviewedAt: null,
        });
        return { id, status: "pending" };
      });
      response.status(201).json(result);
    }),
  );

  api.patch(
    "/status-requests/:id",
    asyncRoute(async (request, response) => {
      const user = currentUser(request);
      if (user.role !== "admin") {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
      }
      const id = positiveId(request.params.id, "Approval ID");
      const { decision } = reviewRequestSchema.parse(request.body);
      const result = await store.update((database) => {
        const item = database.statusRequests.find((entry) => entry.id === id);
        if (!item) {
          throw new AppError(404, "NOT_FOUND", "The approval request was not found.");
        }
        if (item.status !== "pending") {
          throw new AppError(409, "ALREADY_REVIEWED", "This request has already been reviewed.");
        }
        if (decision === "approved") {
          const record = database.records[item.resource].find(
            (entry) => entry.id === item.resourceId,
          );
          const column = statusColumn(item.resource);
          if (!record || record[column] !== item.fromStatus) {
            throw new AppError(409, "RECORD_CHANGED", "The record changed before this request was approved.");
          }
          record[column] = item.toStatus;
          record.updated_at = new Date().toISOString();
        }
        item.status = decision;
        item.reviewedBy = user.id;
        item.reviewedAt = new Date().toISOString();
        return { id, status: decision };
      });
      response.json(result);
    }),
  );

  api.get(
    "/:resource",
    asyncRoute(async (request, response) => {
      const user = currentUser(request);
      const resource = validResource(request.params.resource);
      if (user.role === "inspector" && !canWrite(user, resource)) {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to view this resource.");
      }
      const configForResource = resourceConfig[resource];
      const query = listQuerySchema.parse(request.query);
      if (!configForResource.sortable.includes(query.sort)) {
        throw new AppError(400, "INVALID_SORT", "The requested sort field is not supported.");
      }
      if (query.status && !resourceConfig[resource].columns.includes(statusColumn(resource))) {
        throw new AppError(400, "INVALID_STATUS", "The requested status filter is not supported.");
      }
      if (
        query.status &&
        !supportedResourceStatuses[resource]?.includes(query.status)
      ) {
        throw new AppError(400, "INVALID_STATUS", "The requested status filter is not supported.");
      }
      const result = await store.get((database) => {
        const filtered = database.records[resource].filter((record) => {
          if (user.role === "inspector" && record.assigned_to !== user.id) return false;
          if (
            query.q &&
            !configForResource.searchable.some((field) =>
              String(record[field] ?? "").toLocaleLowerCase().includes(query.q.toLocaleLowerCase()),
            )
          ) {
            return false;
          }
          return !query.status || record[statusColumn(resource)] === query.status;
        });
        const direction = query.direction === "asc" ? 1 : -1;
        filtered.sort((a, b) => {
          const left = a[query.sort];
          const right = b[query.sort];
          if (left === right) return b.id - a.id;
          if (left === null || left === undefined) return 1;
          if (right === null || right === undefined) return -1;
          return (left < right ? -1 : 1) * direction;
        });
        const offset = (query.page - 1) * query.pageSize;
        return {
          data: filtered
            .slice(offset, offset + query.pageSize)
            .map((record) => assignedToName(database, record)),
          page: query.page,
          pageSize: query.pageSize,
          total: filtered.length,
        };
      });
      response.json(result);
    }),
  );

  api.get(
    "/:resource/:id",
    asyncRoute(async (request, response) => {
      const user = currentUser(request);
      const resource = validResource(request.params.resource);
      if (user.role === "inspector" && !canWrite(user, resource)) {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to view this resource.");
      }
      const id = positiveId(request.params.id);
      const data = await store.get((database) => {
        const record = database.records[resource].find(
          (item) =>
            item.id === id &&
            (user.role !== "inspector" || item.assigned_to === user.id),
        );
        return record ? assignedToName(database, record) : undefined;
      });
      if (!data) throw new AppError(404, "NOT_FOUND", "The record was not found.");
      response.json({ data });
    }),
  );

  api.post(
    "/:resource",
    asyncRoute(async (request, response) => {
      const user = currentUser(request);
      const resource = validResource(request.params.resource);
      if (!canCreate(user, resource)) {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to create this record.");
      }
      const input = schemaFor(resource).parse(request.body) as Record<string, unknown>;
      const id = await store.update((database) => {
        if (typeof input.assigned_to === "number") requireAssignee(database, input.assigned_to);
        assertReferences(database, resource, input);
        if (duplicateRecord(database, resource, input)) {
          throw new AppError(409, "CONFLICT", "A record with the same unique value already exists.");
        }
        const id = store.nextId(database, resource);
        const now = new Date().toISOString();
        const defaults: Record<string, unknown> =
          resource === "quick-listings"
            ? { inspection_status: "pending" }
            : resource === "inspections" || resource === "quality-checks"
              ? { status: "pending" }
              : {};
        const record = {
          ...defaults,
          ...input,
          id,
          created_at: now,
          updated_at: now,
        } as LocalRecord;
        database.records[resource].push(record);
        return id;
      });
      response.status(201).json({ id });
    }),
  );

  api.put(
    "/:resource/:id",
    asyncRoute(async (request, response) => {
      const user = currentUser(request);
      const resource = validResource(request.params.resource);
      if (!canWrite(user, resource)) {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to edit this record.");
      }
      const id = positiveId(request.params.id);
      const input = schemaFor(resource).partial().parse(request.body) as Record<string, unknown>;
      const fields = Object.keys(input);
      if (!fields.length) {
        throw new AppError(400, "VALIDATION_ERROR", "At least one field is required.");
      }
      if (
        user.role === "inspector" &&
        fields.some((field) => !["inspections", "quality-checks"].includes(resource) ||
          (resource === "inspections" ? field !== "notes" : field !== "findings"))
      ) {
        throw new AppError(403, "FORBIDDEN", "Inspectors may update only their assigned workflow notes.");
      }
      await store.update((database) => {
        const record = database.records[resource].find(
          (item) =>
            item.id === id &&
            (user.role !== "inspector" || item.assigned_to === user.id),
        );
        if (!record) throw new AppError(404, "NOT_FOUND", "The record was not found.");
        if (typeof input.assigned_to === "number") requireAssignee(database, input.assigned_to);
        assertReferences(database, resource, input);
        if (duplicateRecord(database, resource, input, id)) {
          throw new AppError(409, "CONFLICT", "A record with the same unique value already exists.");
        }
        Object.assign(record, input, { updated_at: new Date().toISOString() });
      });
      response.status(204).end();
    }),
  );

  api.delete(
    "/:resource/:id",
    asyncRoute(async (request, response) => {
      if (currentUser(request).role !== "admin") {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
      }
      const resource = validResource(request.params.resource);
      const id = positiveId(request.params.id);
      await store.update((database) => {
        const position = database.records[resource].findIndex((item) => item.id === id);
        if (position < 0) throw new AppError(404, "NOT_FOUND", "The record was not found.");
        const referencesToClear: Partial<
          Record<ResourceName, readonly { resource: ResourceName; field: string }[]>
        > = {
          sellers: [{ resource: "listings", field: "seller_id" }],
          listings: [
            { resource: "inspections", field: "listing_id" },
            { resource: "quality-checks", field: "listing_id" },
          ],
          "quick-listings": [
            { resource: "inspections", field: "quick_listing_id" },
          ],
          inspections: [{ resource: "quality-checks", field: "inspection_id" }],
        };
        for (const reference of referencesToClear[resource] ?? []) {
          for (const record of database.records[reference.resource]) {
            if (record[reference.field] === id) record[reference.field] = null;
          }
        }
        database.records[resource].splice(position, 1);
      });
      response.status(204).end();
    }),
  );

  return api;
}

export async function initializeLocalApi(store = localStore): Promise<void> {
  const passwordHash = await bcrypt.hash(config.LOCAL_ADMIN_PASSWORD, 12);
  await store.initialize(passwordHash);
  logger.warn(
    { file: config.LOCAL_DATA_FILE, email: config.LOCAL_ADMIN_EMAIL },
    "Using local JSON storage because MySQL is unavailable",
  );
}
