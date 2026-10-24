import bcrypt from "bcryptjs";
import type { ExecuteValues, RowDataPacket } from "mysql2";
import { pool } from "./pool";
import { config } from "../config";

async function insertByUniqueKey(
  table: string,
  keyColumn: string,
  key: string,
  columns: string[],
  values: ExecuteValues[],
): Promise<number> {
  await pool.execute(
    `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    values,
  );
  const [rows] = await pool.execute<Array<RowDataPacket & { id: number }>>(
    `SELECT id FROM \`${table}\` WHERE \`${keyColumn}\` = ? LIMIT 1`,
    [key],
  );
  if (!rows[0]) throw new Error(`Unable to resolve seeded ${table} record.`);
  return rows[0].id;
}

async function seed(): Promise<void> {
  if (!config.SEED_ADMIN_EMAIL || !config.SEED_ADMIN_PASSWORD) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set before seeding.",
    );
  }
  const adminHash = await bcrypt.hash(config.SEED_ADMIN_PASSWORD, 12);
  await pool.execute(
    `INSERT INTO admins (name, email, password_hash, role, active)
     VALUES (?, ?, ?, 'admin', TRUE)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = 'admin', active = TRUE`,
    [
      "CocaCars Administrator",
      config.SEED_ADMIN_EMAIL.toLowerCase(),
      adminHash,
    ],
  );
  await insertByUniqueKey(
    "dealers",
    "email",
    "dealer@example.test",
    ["name", "email", "contact_no"],
    ["Demo Dealer", "dealer@example.test", "+91 90000 00001"],
  );
  await insertByUniqueKey(
    "buyers",
    "email",
    "buyer@example.test",
    [
      "name",
      "email",
      "contact_no",
      "city",
      "listing_limit",
      "status",
      "registered_at",
    ],
    [
      "Demo Buyer",
      "buyer@example.test",
      "+91 90000 00002",
      "Pune",
      5,
      "active",
      "2025-01-15",
    ],
  );
  const sellerId = await insertByUniqueKey(
    "sellers",
    "email",
    "seller@example.test",
    ["name", "email", "contact_no", "city", "status", "registered_at"],
    [
      "Demo Seller",
      "seller@example.test",
      "+91 90000 00003",
      "Pune",
      "active",
      "2025-02-10",
    ],
  );
  const listingId = await insertByUniqueKey(
    "listings",
    "registration_no",
    "DEMO-01-AB-0001",
    [
      "registration_no",
      "seller_id",
      "ref_id",
      "brand",
      "model",
      "model_year",
      "variant",
      "body_type",
      "fuel_type",
      "transmission",
      "kilometers",
      "color",
      "price",
      "registration_date",
      "owner_count",
      "insurance_type",
      "insurance_expiry",
      "state",
      "city",
      "seller_name",
      "seller_mobile",
      "address",
      "description",
      "features",
      "status",
      "is_featured",
      "is_home",
    ],
    [
      "DEMO-01-AB-0001",
      sellerId,
      "DEMO-LST-001",
      "Tata",
      "Nexon",
      2022,
      "XZ+",
      "SUV",
      "petrol",
      "manual",
      23000,
      "Slate Grey",
      895000,
      "2022-06-01",
      1,
      "Comprehensive",
      "2027-06-01",
      "Maharashtra",
      "Pune",
      "Demo Seller",
      "+91 90000 00003",
      "Demo address, Pune",
      "Synthetic vehicle listing for local development.",
      JSON.stringify(["ABS", "Rear camera"]),
      "available",
      true,
      false,
    ],
  );
  await pool.execute(
    `INSERT INTO quick_listings
      (ref_id, registration_no, customer_name, mobile, address, city, state, pincode,
       brand, model, variant, price, appointment_at, inspection_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [
      "DEMO-QL-001",
      "DEMO-02-CD-0002",
      "Synthetic Contact",
      "+91 90000 00004",
      "Demo address, Pune",
      "Pune",
      "Maharashtra",
      "411001",
      "Hyundai",
      "i20",
      "Sportz",
      640000,
      "2025-05-20 10:00:00",
    ],
  );
  const [quickRows] = await pool.execute<Array<RowDataPacket & { id: number }>>(
    "SELECT id FROM quick_listings WHERE ref_id = ? LIMIT 1",
    ["DEMO-QL-001"],
  );
  const quickId = quickRows[0]?.id;
  if (!quickId) throw new Error("Unable to resolve seeded quick listing.");
  const inspectionId = await insertByUniqueKey(
    "inspections",
    "ref_id",
    "DEMO-IN-001",
    [
      "listing_id",
      "quick_listing_id",
      "ref_id",
      "registration_no",
      "customer_name",
      "mobile",
      "status",
      "scheduled_at",
      "notes",
    ],
    [
      listingId,
      quickId,
      "DEMO-IN-001",
      "DEMO-01-AB-0001",
      "Synthetic Contact",
      "+91 90000 00004",
      "pending",
      "2025-05-21 10:00:00",
      "Synthetic inspection record.",
    ],
  );
  await insertByUniqueKey(
    "quality_checks",
    "ref_id",
    "DEMO-QC-001",
    [
      "inspection_id",
      "listing_id",
      "ref_id",
      "registration_no",
      "customer_name",
      "mobile",
      "status",
      "findings",
    ],
    [
      inspectionId,
      listingId,
      "DEMO-QC-001",
      "DEMO-01-AB-0001",
      "Synthetic Contact",
      "+91 90000 00004",
      "pending",
      "Synthetic quality review record.",
    ],
  );
  const [existingRepair] = await pool.execute<
    Array<RowDataPacket & { id: number }>
  >(
    "SELECT id FROM repairs WHERE registration_no = ? AND scheduled_date = ? LIMIT 1",
    ["DEMO-03-EF-0003", "2025-06-15"],
  );
  if (!existingRepair[0]) {
    await pool.execute(
      `INSERT INTO repairs
        (registration_no, customer_name, mobile, address, city, state, pincode, brand, model,
         variant, work_type, scheduled_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "DEMO-03-EF-0003",
        "Synthetic Contact",
        "+91 90000 00005",
        "Demo address, Pune",
        "Pune",
        "Maharashtra",
        "411001",
        "Maruti Suzuki",
        "Baleno",
        "Delta",
        "Scheduled service",
        "2025-06-15",
        "requested",
        "Synthetic service request.",
      ],
    );
  }
  console.info("Seeded synthetic local records.");
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
