"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.localStore = exports.LocalJsonStore = void 0;
exports.localAdminUser = localAdminUser;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("../config");
const resources = [
    "listings",
    "dealers",
    "buyers",
    "sellers",
    "quick-listings",
    "inspections",
    "quality-checks",
    "repairs",
];
function emptyDatabase() {
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
        nextIds: {},
    };
}
class LocalJsonStore {
    filePath;
    queue = Promise.resolve();
    constructor(filePath = node_path_1.default.resolve(config_1.config.LOCAL_DATA_FILE)) {
        this.filePath = filePath;
    }
    async read() {
        try {
            return JSON.parse(await (0, promises_1.readFile)(this.filePath, "utf8"));
        }
        catch (error) {
            if (typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === "ENOENT") {
                return emptyDatabase();
            }
            throw error;
        }
    }
    async write(database) {
        await (0, promises_1.mkdir)(node_path_1.default.dirname(this.filePath), { recursive: true });
        const temporaryPath = `${this.filePath}.${(0, node_crypto_1.randomUUID)()}.tmp`;
        await (0, promises_1.writeFile)(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, {
            encoding: "utf8",
            mode: 0o600,
        });
        await (0, promises_1.rename)(temporaryPath, this.filePath);
    }
    async get(read) {
        await this.queue;
        return read(await this.read());
    }
    async update(change) {
        let release;
        const previous = this.queue;
        this.queue = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            const database = await this.read();
            const result = await change(database);
            await this.write(database);
            return result;
        }
        finally {
            release();
        }
    }
    async initialize(passwordHash) {
        await this.update((database) => {
            for (const resource of resources) {
                database.records[resource] ??= [];
                database.nextIds[resource] = Math.max(database.nextIds[resource] ?? 1, database.records[resource].reduce((nextId, record) => Math.max(nextId, record.id + 1), 1));
            }
            database.nextIds.admins = Math.max(database.nextIds.admins ?? 1, database.admins.reduce((nextId, admin) => Math.max(nextId, admin.id + 1), 1));
            database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now());
            const email = config_1.config.LOCAL_ADMIN_EMAIL.toLowerCase();
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
    nextId(database, table) {
        const id = database.nextIds[table] ?? 1;
        database.nextIds[table] = id + 1;
        return id;
    }
}
exports.LocalJsonStore = LocalJsonStore;
exports.localStore = new LocalJsonStore();
function localAdminUser(admin) {
    return {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
    };
}
