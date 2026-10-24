import { describe, expect, it } from "vitest";
import { profileUpdateSchema, resourceSchemas } from "../../server/validation";

describe("server-side input validation", () => {
  it("normalizes email and trims user-provided text", () => {
    const dealer = resourceSchemas.dealers.parse({
      name: "  Example Dealer ",
      email: " SALES@EXAMPLE.TEST ",
      contact_no: "+91 90000 00001",
    });
    expect(dealer.name).toBe("Example Dealer");
    expect(dealer.email).toBe("sales@example.test");
  });

  it("rejects unknown fields rather than allowing mass assignment", () => {
    expect(() =>
      resourceSchemas.dealers.parse({
        name: "Example Dealer",
        email: "dealer@example.test",
        contact_no: "+91 90000 00001",
        role: "admin",
      }),
    ).toThrow();
  });

  it("requires the current password before accepting a password change", () => {
    expect(
      profileUpdateSchema.safeParse({
        name: "Admin User",
        email: "admin@example.test",
        newPassword: "synthetic-new-password",
      }).success,
    ).toBe(false);
  });
});
