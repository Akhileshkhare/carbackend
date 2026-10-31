import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthUser, ResourceName } from "../../shared/contracts";
import { config } from "../config";

export interface LocalAdmin extends AuthUser {
  passwordHash: string;
  active: boolean;
}

export interface LocalSession {
  id: string;
  adminId: number;
  csrfToken: string;
  expiresAt: number;
}

export type LocalRecord = Record<string, unknown> & {
  id: number;
  created_at: string;
  updated_at: string;
};

export interface LocalStatusRequest {
  id: number;
  resource: "inspections" | "quality-checks" | "quick-listings";
  resourceId: number;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  requestedBy: number;
  reviewedBy: number | null;
  requestedAt: string;
  reviewedAt: string | null;
}

export interface LocalUpload {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: number;
  createdAt: string;
}

export interface LocalDatabase {
  admins: LocalAdmin[];
  sessions: LocalSession[];
  records: Record<ResourceName, LocalRecord[]>;
  statusRequests: LocalStatusRequest[];
  uploads: LocalUpload[];
  nextIds: Record<string, number>;
}

const resources: ResourceName[] = [
  "listings",
  "dealers",
  "buyers",
  "sellers",
  "quick-listings",
  "inspections",
  "quality-checks",
  "repairs",
];

function emptyDatabase(): LocalDatabase {
  return {
    admins: [],
    sessions: [],
    records: {
      listings: [],
      dealers: [],
      buyers: [],
      sellers: [],
      "quick-listings": [],
      inspections: [],
      "quality-checks": [],
      repairs: [],
    },
    statusRequests: [],
    uploads: [],
    nextIds: {},
  };
}

export class LocalJsonStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath = path.resolve(config.LOCAL_DATA_FILE)) {}

  private async read(): Promise<LocalDatabase> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as LocalDatabase;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return emptyDatabase();
      }
      throw error;
    }
  }

  private async write(database: LocalDatabase): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }

  async get<T>(read: (database: LocalDatabase) => T): Promise<T> {
    await this.queue;
    return read(await this.read());
  }

  async update<T>(
    change: (database: LocalDatabase) => T | Promise<T>,
  ): Promise<T> {
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const database = await this.read();
      const result = await change(database);
      await this.write(database);
      return result;
    } finally {
      release();
    }
  }

  async initialize(passwordHash: string): Promise<void> {
    await this.update((database) => {
      for (const resource of resources) {
        database.records[resource] ??= [];
        database.nextIds[resource] = Math.max(
          database.nextIds[resource] ?? 1,
          database.records[resource].reduce(
            (nextId, record) => Math.max(nextId, record.id + 1),
            1,
          ),
        );
      }
      database.uploads ??= [];
      database.nextIds.admins = Math.max(
        database.nextIds.admins ?? 1,
        database.admins.reduce((nextId, admin) => Math.max(nextId, admin.id + 1), 1),
      );
      database.sessions = database.sessions.filter(
        (session) => session.expiresAt > Date.now(),
      );
      const email = config.LOCAL_ADMIN_EMAIL.toLowerCase();
      const existing = database.admins.find((admin) => admin.email === email);
      if (!existing && database.admins.length === 0) {
        const id = this.nextId(database, "admins");
        database.admins.push({
          id,
          name: "Administrator",
          email,
          role: "admin",
          passwordHash,
          active: true,
        });
      }
    });
  }

  nextId(database: LocalDatabase, table: string): number {
    const id = database.nextIds[table] ?? 1;
    database.nextIds[table] = id + 1;
    return id;
  }
}

export const localStore = new LocalJsonStore();

export function localAdminUser(admin: LocalAdmin): AuthUser {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  };
}
