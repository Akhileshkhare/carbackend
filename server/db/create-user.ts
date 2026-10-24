import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "./pool";

const userInput = z.object({
  NEW_USER_NAME: z.string().trim().min(1).max(120),
  NEW_USER_EMAIL: z.string().trim().email().max(254).toLowerCase(),
  NEW_USER_PASSWORD: z.string().min(12).max(200),
  NEW_USER_ROLE: z.enum(["admin", "operations", "inspector"]),
});

async function createUser(): Promise<void> {
  const input = userInput.parse(process.env);
  const passwordHash = await bcrypt.hash(input.NEW_USER_PASSWORD, 12);
  await pool.execute(
    `INSERT INTO admins (name, email, password_hash, role, active)
     VALUES (?, ?, ?, ?, TRUE)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = VALUES(role), active = TRUE`,
    [
      input.NEW_USER_NAME,
      input.NEW_USER_EMAIL,
      passwordHash,
      input.NEW_USER_ROLE,
    ],
  );
  console.info(`Provisioned ${input.NEW_USER_ROLE} account.`);
}

createUser()
  .catch((error: unknown) => {
    console.error(
      "Account provisioning failed.",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
