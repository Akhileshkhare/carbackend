import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express from "express";
import { mkdtemp, readFile, rmdir, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../../server/config";
import { LocalJsonStore } from "../../server/db/local-store";
import { errorHandler, notFound } from "../../server/errors";
import { createLocalApi } from "../../server/local-api";

describe("local JSON storage fallback", () => {
  let directory: string;
  let filePath: string;
  let app: express.Express;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "carbackend-local-test-"));
    filePath = path.join(directory, "local-db.json");
    const store = new LocalJsonStore(filePath);
    await store.initialize(await bcrypt.hash("Admin@123", 4));
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(
      "/api",
      createLocalApi(
        rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: false, legacyHeaders: false }),
        store,
      ),
    );
    app.use("/api", notFound);
    app.use(errorHandler);
  });

  afterAll(async () => {
    await unlink(filePath);
    await rmdir(directory);
  });

  it("authenticates with the default admin and persists complete CRUD operations", async () => {
    const client = request.agent(app);
    const login = await client
      .post("/api/auth/login")
      .set("Origin", config.WEB_ORIGIN)
      .send({ email: "admin@gmail.com", password: "Admin@123" });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe("admin@gmail.com");

    const csrfToken = login.body.csrfToken as string;
    const dealer = {
      name: "Local JSON Dealer",
      email: "local-dealer@example.test",
      contact_no: "+91 90000 00001",
    };
    const created = await client
      .post("/api/dealers")
      .set("x-csrf-token", csrfToken)
      .send(dealer);
    expect(created.status).toBe(201);

    const id = created.body.id as number;
    const listed = await client.get("/api/dealers");
    expect(listed.body).toMatchObject({ total: 1, data: [{ id, ...dealer }] });

    const fetched = await client.get(`/api/dealers/${id}`);
    expect(fetched.body.data).toMatchObject({ id, ...dealer });

    const updated = await client
      .put(`/api/dealers/${id}`)
      .set("x-csrf-token", csrfToken)
      .send({ name: "Updated Local Dealer" });
    expect(updated.status).toBe(204);

    const deleted = await client
      .delete(`/api/dealers/${id}`)
      .set("x-csrf-token", csrfToken);
    expect(deleted.status).toBe(204);
    expect((await client.get("/api/dealers")).body.total).toBe(0);

    const persisted = JSON.parse(await readFile(filePath, "utf8")) as {
      admins: unknown[];
      records: { dealers: unknown[] };
      sessions: unknown[];
    };
    expect(persisted.admins).toHaveLength(1);
    expect(persisted.records.dealers).toHaveLength(0);
    expect(persisted.sessions).toHaveLength(1);

    const inspection = await client
      .post("/api/inspections")
      .set("x-csrf-token", csrfToken)
      .send({
        ref_id: "LOCAL-INS-001",
        registration_no: "LOCAL-01-AA-0001",
        customer_name: "Local Customer",
        mobile: "+91 90000 00002",
      });
    expect(inspection.status).toBe(201);

    const statusRequest = await client
      .post("/api/status-requests")
      .set("x-csrf-token", csrfToken)
      .send({
        resource: "inspections",
        resourceId: inspection.body.id,
        toStatus: "inspecting",
      });
    expect(statusRequest.status).toBe(201);
    expect((await client.get("/api/status-requests")).body.data).toHaveLength(1);

    const reviewed = await client
      .patch(`/api/status-requests/${statusRequest.body.id}`)
      .set("x-csrf-token", csrfToken)
      .send({ decision: "approved" });
    expect(reviewed.body.status).toBe("approved");
    expect((await client.get(`/api/inspections/${inspection.body.id}`)).body.data.status).toBe(
      "inspecting",
    );

    const dashboard = await client.get("/api/dashboard");
    expect(dashboard.body).toMatchObject({
      listings: 0,
      dealers: 0,
      pendingInspections: 0,
      pendingApprovals: 0,
    });
  });
});
