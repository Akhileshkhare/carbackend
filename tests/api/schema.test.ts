import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("database schema deliverables", () => {
  it("keeps the standalone creation script aligned with the initial migration", async () => {
    const migration = await readFile(
      path.resolve("database/migrations/001_initial.sql"),
      "utf8",
    );
    const standalone = await readFile(
      path.resolve("database/schema.sql"),
      "utf8",
    );
    const normalizeDatabaseName = (schema: string) =>
      schema
        .replace(
          /^CREATE DATABASE IF NOT EXISTS [^;\r\n]+/m,
          "CREATE DATABASE IF NOT EXISTS <database>",
        )
        .replace(/^USE [^;\r\n]+;/m, "USE <database>;");
    expect(normalizeDatabaseName(standalone)).toBe(
      normalizeDatabaseName(migration),
    );
  });
});
