import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../shared/contracts";
import { createApp } from "../../server/app";
import type { Request } from "express";

const operationsUser: AuthUser = {
  id: 3,
  name: "Synthetic Operations User",
  email: "operations@example.test",
  role: "operations",
};
const inspectorUser: AuthUser = {
  id: 4,
  name: "Synthetic Inspector",
  email: "inspector@example.test",
  role: "inspector",
};
const authenticatedAs = (user: AuthUser) => async (request: Request) => {
  request.authUser = user;
  request.authCsrfToken = "synthetic-csrf-token";
  return user;
};

describe("REST API authentication, authorization, and validation", () => {
  it("reports a healthy service without requiring database access", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(createApp()).get("/api/dealers");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(response.body.error.message).not.toContain("SELECT");
  });

  it("rejects login requests from an untrusted origin", async () => {
    const response = await request(createApp())
      .post("/api/auth/login")
      .set("Origin", "https://untrusted.example")
      .send({
        email: "admin@example.test",
        password: "synthetic-test-password",
      });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ORIGIN_INVALID");
  });

  it("validates sign-in input without querying credentials", async () => {
    const response = await request(createApp())
      .post("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .send({ email: "invalid", password: "" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).not.toContain("password");
  });

  it("requires the current password before processing a profile password change", async () => {
    const response = await request(createApp(authenticatedAs(operationsUser)))
      .put("/api/auth/profile")
      .send({
        name: "Synthetic Operations User",
        email: "operations@example.test",
        newPassword: "synthetic-new-password",
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects unapproved role access to the approval queue", async () => {
    const response = await request(
      createApp(authenticatedAs(operationsUser)),
    ).get("/api/status-requests");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("returns the session CSRF token to a signed-in cross-origin frontend", async () => {
    const response = await request(createApp(authenticatedAs(operationsUser)))
      .get("/api/auth/me");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      user: operationsUser,
      csrfToken: "synthetic-csrf-token",
    });
  });

  it("does not cache API responses or return cached 304 responses", async () => {
    const response = await request(createApp(authenticatedAs(operationsUser)))
      .get("/api/auth/me")
      .set("If-None-Match", '"stale-dashboard-etag"');
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.etag).toBeUndefined();
  });

  it("restricts demo data seeding to administrators", async () => {
    const response = await request(createApp(authenticatedAs(operationsUser)))
      .post("/api/demo-data/seed")
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("prevents inspectors from listing unrelated customer records", async () => {
    const response = await request(
      createApp(authenticatedAs(inspectorUser)),
    ).get("/api/buyers");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("prevents operations users from deleting records", async () => {
    const response = await request(
      createApp(authenticatedAs(operationsUser)),
    ).delete("/api/dealers/1");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects invalid dealer data before database access", async () => {
    const response = await request(createApp(authenticatedAs(operationsUser)))
      .post("/api/dealers")
      .send({ name: " ", email: "not-an-email", contact_no: "bad" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body).not.toHaveProperty("stack");
  });

  it("does not allow status changes to bypass approval on inspections", async () => {
    const response = await request(createApp(authenticatedAs(operationsUser)))
      .put("/api/inspections/8")
      .send({ status: "completed" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a status value outside the observed inspection workflow", async () => {
    const response = await request(createApp(authenticatedAs(inspectorUser)))
      .post("/api/status-requests")
      .send({ resource: "inspections", resourceId: 8, toStatus: "deleted" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_STATUS");
  });
});
