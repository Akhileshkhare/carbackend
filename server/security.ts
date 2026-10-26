import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db/pool";
import { AppError } from "./errors";
import { config } from "./config";
import type { AuthUser, Role } from "../shared/contracts";

export const SESSION_COOKIE = "cc_session";
export const CSRF_COOKIE = "cc_csrf";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function setSessionCookies(
  response: Response,
  sessionId: string,
  csrf: string,
  rememberMe: boolean,
): void {
  const secure = config.COOKIE_SECURE === "true";
  const common = {
    secure,
    sameSite: config.COOKIE_SAME_SITE,
    path: "/",
  };
  const maxAge = rememberMe ? REMEMBER_SESSION_TTL_MS : undefined;
  response.cookie(SESSION_COOKIE, sessionId, {
    ...common,
    httpOnly: true,
    ...(maxAge ? { maxAge } : {}),
  });
  response.cookie(CSRF_COOKIE, csrf, {
    ...common,
    httpOnly: false,
    ...(maxAge ? { maxAge } : {}),
  });
}

export function clearSessionCookies(response: Response): void {
  const secure = config.COOKIE_SECURE === "true";
  const common = {
    secure,
    sameSite: config.COOKIE_SAME_SITE,
    path: "/",
  };
  response.clearCookie(SESSION_COOKIE, { ...common, httpOnly: true });
  response.clearCookie(CSRF_COOKIE, { ...common, httpOnly: false });
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export function bearerSessionToken(request: Request): string | undefined {
  const match = request.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i);
  return match?.[1];
}

export async function createSession(
  adminId: number,
  rememberMe: boolean,
): Promise<{ id: string; csrf: string }> {
  const id = createOpaqueToken();
  const csrf = createOpaqueToken();
  const expiresAt = new Date(
    Date.now() + (rememberMe ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS),
  );
  await pool.execute(
    "DELETE FROM auth_sessions WHERE expires_at <= UTC_TIMESTAMP()",
  );
  await pool.execute(
    "INSERT INTO auth_sessions (id, admin_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)",
    [hashToken(id), adminId, csrf, expiresAt],
  );
  return { id, csrf };
}

interface SessionRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: Role;
  csrf_token: string;
  expires_at: Date;
}

export async function authenticate(request: Request): Promise<AuthUser> {
  const bearerToken = bearerSessionToken(request);
  const rawId =
    bearerToken ??
    (request.cookies?.[SESSION_COOKIE] as string | undefined);
  if (!rawId || !/^[a-f0-9]{64}$/.test(rawId)) {
    throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }

  const [rows] = await pool.execute<SessionRow[]>(
    `SELECT a.id, a.name, a.email, a.role, s.csrf_token, s.expires_at
     FROM auth_sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.id = ? AND a.active = TRUE AND s.expires_at > UTC_TIMESTAMP() LIMIT 1`,
    [hashToken(rawId)],
  );
  const session = rows[0];
  if (!session)
    throw new AppError(
      401,
      "SESSION_EXPIRED",
      "Your session has expired. Sign in again.",
    );

  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const cookieCsrf = request.cookies?.[CSRF_COOKIE] as string | undefined;
    const headerCsrf = request.get("x-csrf-token");
    if (
      !headerCsrf ||
      headerCsrf !== session.csrf_token ||
      (!bearerToken && (!cookieCsrf || cookieCsrf !== session.csrf_token))
    ) {
      throw new AppError(
        403,
        "CSRF_INVALID",
        "The request could not be verified. Refresh and try again.",
      );
    }
  }
  request.authUser = {
    id: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
  };
  request.authCsrfToken = session.csrf_token;
  request.authSessionToken = rawId;
  return request.authUser;
}

export function requireRoles(...roles: Role[]) {
  return (user: AuthUser): void => {
    if (!roles.includes(user.role)) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "You do not have permission to perform this action.",
      );
    }
  };
}
