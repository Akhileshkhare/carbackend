"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const promise_1 = __importDefault(require("mysql2/promise"));
const config_1 = require("../config");
async function migrate() {
    const connection = await promise_1.default.createConnection({
        host: config_1.config.MYSQL_HOST,
        port: config_1.config.MYSQL_PORT,
        user: config_1.config.MYSQL_USER,
        password: config_1.config.MYSQL_PASSWORD,
        database: config_1.config.MYSQL_DATABASE,
    });
    try {
        const migration = await (0, promises_1.readFile)(node_path_1.default.resolve(process.cwd(), "database/migrations/001_initial.sql"), "utf8");
        const statements = migration
            .replace(/^\s*CREATE DATABASE IF NOT EXISTS[^;]+;\s*/i, "")
            .replace(/^\s*USE [^;]+;\s*/i, "")
            .split(";")
            .map((statement) => statement.trim())
            .filter(Boolean);
        await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`);
        const [applied] = await connection.execute("SELECT version FROM schema_migrations WHERE version = ? LIMIT 1", ["001_initial"]);
        if (applied.length) {
            console.info("Database migration 001_initial is already applied.");
            return;
        }
        for (const statement of statements)
            await connection.query(statement);
        await connection.execute("INSERT IGNORE INTO schema_migrations (version) VALUES (?)", ["001_initial"]);
        console.info("Applied database migration 001_initial.");
    }
    finally {
        await connection.end();
    }
}
migrate().catch((error) => {
    console.error("Database migration failed.", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
});
