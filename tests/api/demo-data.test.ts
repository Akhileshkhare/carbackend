import bcrypt from "bcryptjs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { seedLocalDemoData } from "../../server/db/demo-data";
import { LocalJsonStore } from "../../server/db/local-store";

describe("synthetic demo data", () => {
  it("seeds every resource with linked records and can be rerun safely", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "carbackend-demo-test-"));
    const filePath = path.join(directory, "local-db.json");
    try {
      const store = new LocalJsonStore(filePath);
      await store.initialize(await bcrypt.hash("synthetic-test-password", 4));
      await seedLocalDemoData(store);
      await seedLocalDemoData(store);

      const database = JSON.parse(await readFile(filePath, "utf8")) as {
        records: Record<string, Array<Record<string, unknown>>>;
        statusRequests: Array<Record<string, unknown>>;
      };
      for (const resource of [
        "listings",
        "dealers",
        "buyers",
        "sellers",
        "quick-listings",
        "inspections",
        "quality-checks",
        "repairs",
      ]) {
        expect(database.records[resource]).toHaveLength(5);
      }
      expect(database.statusRequests).toHaveLength(2);

      const sellerIds = new Set(database.records.sellers.map((record) => record.id));
      expect(
        database.records.listings.every((record) => sellerIds.has(record.seller_id)),
      ).toBe(true);
      const listingIds = new Set(database.records.listings.map((record) => record.id));
      expect(
        database.records.inspections.every((record) =>
          listingIds.has(record.listing_id),
        ),
      ).toBe(true);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
