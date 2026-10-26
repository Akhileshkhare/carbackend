import type { AuthUser } from "../../shared/contracts";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      authCsrfToken?: string;
      authSessionToken?: string;
    }
  }
}

export {};
