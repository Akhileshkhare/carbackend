import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import type { Connection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const database = process.env.MYSQL_TEST_DATABASE ?? "";
const safeDatabaseName = /^cocacars_[a-z0-9_]*test[a-z0-9_]*$/i.test(database);
const enabled = Boolean(
  database && safeDatabaseName && process.env.MYSQL_TEST_USER,
);
let connection: Connection | undefined;

describe.skipIf(!enabled)("isolated MySQL schema and persistence", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection({
      host: process.env.MYSQL_TEST_HOST ?? "127.0.0.1",
      port: Number(process.env.MYSQL_TEST_PORT ?? 3306),
      database,
      user: process.env.MYSQL_TEST_USER,
      password: process.env.MYSQL_TEST_PASSWORD ?? "",
    });
    const migration = await readFile(
      path.resolve("database/migrations/001_initial.sql"),
      "utf8",
    );
    const statements = migration
      .replace(/^\s*CREATE DATABASE IF NOT EXISTS[^;]+;\s*/i, "")
      .replace(/^\s*USE [^;]+;\s*/i, "")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await connection.query(statement);
  });

  afterAll(async () => {
    await connection?.end();
  });

  it("creates the operational entities in the explicitly named test database", async () => {
    const [rows] = await connection!.execute<
      Array<RowDataPacket & { table_name: string }>
    >(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
      [database],
    );
    const tables = rows.map((row) => row.table_name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "admins",
        "auth_sessions",
        "dealers",
        "buyers",
        "sellers",
        "listings",
        "quick_listings",
        "inspections",
        "quality_checks",
        "repairs",
        "status_change_requests",
      ]),
    );
  });

  it("persists parameterized data inside a rollback-only test transaction", async () => {
    await connection!.beginTransaction();
    try {
      const email = `db-test-${Date.now()}@example.test`;
      await connection!.execute(
        "INSERT INTO dealers (name, email, contact_no) VALUES (?, ?, ?)",
        ["Synthetic DB Test Dealer", email, "+91 90000 00008"],
      );
      const [rows] = await connection!.execute<
        Array<RowDataPacket & { name: string }>
      >("SELECT name FROM dealers WHERE email = ? LIMIT 1", [email]);
      expect(rows[0]?.name).toBe("Synthetic DB Test Dealer");
    } finally {
      await connection!.rollback();
    }
  });
});
