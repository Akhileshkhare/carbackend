export type Role = "admin" | "operations" | "inspector";

export type ResourceName =
  | "listings"
  | "dealers"
  | "buyers"
  | "sellers"
  | "quick-listings"
  | "inspections"
  | "quality-checks"
  | "repairs";

export type InspectionStatus = "pending" | "inspecting" | "completed";
export type QualityStatus = "pending" | "completed" | "in_correction";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface ApiError {
  error: { code: string; message: string; requestId?: string };
}

export interface ProfileUpdate {
  name: string;
  email: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface PageResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface StatusChangeRequest {
  id: number;
  resource: "inspections" | "quality-checks" | "quick-listings";
  resourceId: number;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  status: RequestStatus;
  requestedBy: string;
  requestedAt: string;
}
