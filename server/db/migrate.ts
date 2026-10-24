import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { config } from "../config";

async function migrate(): Promise<void> {
  const connection = await mysql.createConnection({
    host: config.MYSQL_HOST,
    port: config.MYSQL_PORT,
    user: config.MYSQL_USER,
    password: config.MYSQL_PASSWORD,
    database: config.MYSQL_DATABASE,
  });
  try {
    const migration = await readFile(
      path.resolve(process.cwd(), "database/migrations/001_initial.sql"),
      "utf8",
    );
    const statements = migration
      .replace(/^\s*CREATE DATABASE IF NOT EXISTS[^;]+;\s*/i, "")
      .replace(/^\s*USE [^;]+;\s*/i, "")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    await connection.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`,
    );
    const [applied] = await connection.execute<RowDataPacket[]>(
      "SELECT version FROM schema_migrations WHERE version = ? LIMIT 1",
      ["001_initial"],
    );
    if (applied.length) {
      console.info("Database migration 001_initial is already applied.");
      return;
    }
    for (const statement of statements) await connection.query(statement);
    await connection.execute(
      "INSERT IGNORE INTO schema_migrations (version) VALUES (?)",
      ["001_initial"],
    );
    console.info("Applied database migration 001_initial.");
  } finally {
    await connection.end();
  }
}

migrate().catch((error: unknown) => {
  console.error(
    "Database migration failed.",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
