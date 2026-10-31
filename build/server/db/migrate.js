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
        await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`);
        const files = (await (0, promises_1.readdir)(node_path_1.default.resolve(process.cwd(), "database/migrations")))
            .filter((file) => /^\d+_.+\.sql$/i.test(file))
            .sort();
        for (const file of files) {
            const version = file.replace(/\.sql$/i, "");
            const [applied] = await connection.execute("SELECT version FROM schema_migrations WHERE version = ? LIMIT 1", [version]);
            if (applied.length)
                continue;
            const migration = await (0, promises_1.readFile)(node_path_1.default.resolve(process.cwd(), "database/migrations", file), "utf8");
            const statements = migration
                .replace(/^\s*CREATE DATABASE IF NOT EXISTS[^;]+;\s*/i, "")
                .replace(/^\s*USE [^;]+;\s*/i, "")
                .split(";")
                .map((statement) => statement.trim())
                .filter(Boolean);
            for (const statement of statements)
                await connection.query(statement);
            await connection.execute("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
            console.info(`Applied database migration ${version}.`);
        }
    }
    finally {
        await connection.end();
    }
}
migrate().catch((error) => {
    console.error("Database migration failed.", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
});
