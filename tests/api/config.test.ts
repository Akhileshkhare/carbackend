import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv/config", () => ({}));

describe("production session cookie defaults", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("uses secure cross-site cookies when production cookie settings are omitted", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSecure = process.env.COOKIE_SECURE;
    const originalSameSite = process.env.COOKIE_SAME_SITE;
    const originalSeedDemoData = process.env.SEED_DEMO_DATA;
    const originalStorageMode = process.env.STORAGE_MODE;
    process.env.NODE_ENV = "production";
    delete process.env.COOKIE_SECURE;
    delete process.env.COOKIE_SAME_SITE;
    delete process.env.SEED_DEMO_DATA;
    delete process.env.STORAGE_MODE;

    try {
      vi.resetModules();
      const { config } = await import("../../server/config");
      expect(config.COOKIE_SECURE).toBe("true");
      expect(config.COOKIE_SAME_SITE).toBe("none");
      expect(config.SEED_DEMO_DATA).toBe("false");
      expect(config.STORAGE_MODE).toBe("json");
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalSecure === undefined) delete process.env.COOKIE_SECURE;
      else process.env.COOKIE_SECURE = originalSecure;
      if (originalSameSite === undefined) delete process.env.COOKIE_SAME_SITE;
      else process.env.COOKIE_SAME_SITE = originalSameSite;
      if (originalSeedDemoData === undefined)
        delete process.env.SEED_DEMO_DATA;
      else process.env.SEED_DEMO_DATA = originalSeedDemoData;
      if (originalStorageMode === undefined) delete process.env.STORAGE_MODE;
      else process.env.STORAGE_MODE = originalStorageMode;
    }
  });
});
