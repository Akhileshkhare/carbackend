import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { config } from "../config";
import { LocalJsonStore } from "./local-store";
import { pool } from "./pool";
import { seedLocalDemoData, seedMysqlDemoData } from "./demo-data";

async function seedMysql(): Promise<void> {
  if (!config.SEED_ADMIN_EMAIL || !config.SEED_ADMIN_PASSWORD) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set before seeding MySQL.",
    );
  }
  const adminEmail = config.SEED_ADMIN_EMAIL.toLowerCase();
  const adminHash = await bcrypt.hash(config.SEED_ADMIN_PASSWORD, 12);
  await pool.execute(
    `INSERT INTO admins (name, email, password_hash, role, active)
     VALUES (?, ?, ?, 'admin', TRUE)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = 'admin', active = TRUE`,
    ["CocaCars Administrator", adminEmail, adminHash],
  );
  const [rows] = await pool.execute<Array<RowDataPacket & { id: number }>>(
    "SELECT id FROM admins WHERE email = ? LIMIT 1",
    [adminEmail],
  );
  if (!rows[0]) throw new Error("Unable to resolve the seeded administrator.");
  await seedMysqlDemoData(rows[0].id);
}

async function seedLocal(): Promise<void> {
  const store = new LocalJsonStore();
  await store.initialize(await bcrypt.hash(config.LOCAL_ADMIN_PASSWORD, 12));
  await seedLocalDemoData(store);
}

async function seed(): Promise<void> {
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    console.warn(
      "MySQL is unavailable; seeding the configured local JSON store instead.",
      error instanceof Error ? error.message : "Unknown connection error",
    );
    await seedLocal();
    console.info("Seeded synthetic demo records in local JSON storage.");
    return;
  }
  await seedMysql();
  console.info("Seeded synthetic demo records in MySQL.");
}

seed()
  .catch((error: unknown) => {
    console.error(
      "Database seed failed.",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
