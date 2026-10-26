import type { ResourceName } from "../../shared/contracts";
import {
  localStore,
  type LocalDatabase,
  type LocalJsonStore,
  type LocalRecord,
} from "./local-store";
import { pool } from "./pool";
import type { ExecuteValues, RowDataPacket } from "mysql2";
import demoData from "./demo-data.json";

const sellers = [
  { name: "Aarav Sharma", email: "aarav.sharma@example.test", contact_no: "+91 90000 00101", city: "Pune", status: "active", registered_at: "2025-01-15" },
  { name: "Mira Patel", email: "mira.patel@example.test", contact_no: "+91 90000 00102", city: "Mumbai", status: "active", registered_at: "2025-02-10" },
  { name: "Kabir Mehta", email: "kabir.mehta@example.test", contact_no: "+91 90000 00103", city: "Jaipur", status: "pending", registered_at: "2025-03-05" },
  { name: "Ishita Rao", email: "ishita.rao@example.test", contact_no: "+91 90000 00104", city: "Bengaluru", status: "inactive", registered_at: "2025-04-12" },
  { name: "Dev Malhotra", email: "dev.malhotra@example.test", contact_no: "+91 90000 00105", city: "Delhi", status: "active", registered_at: "2025-05-20" },
];

const buyers = [
  { name: "Anaya Singh", email: "anaya.singh@example.test", contact_no: "+91 90000 00201", city: "Pune", listing_limit: 5, status: "active", registered_at: "2025-01-18" },
  { name: "Reyansh Gupta", email: "reyansh.gupta@example.test", contact_no: "+91 90000 00202", city: "Mumbai", listing_limit: 3, status: "pending", registered_at: "2025-02-22" },
  { name: "Diya Nair", email: "diya.nair@example.test", contact_no: "+91 90000 00203", city: "Kochi", listing_limit: 8, status: "active", registered_at: "2025-03-16" },
  { name: "Arjun Verma", email: "arjun.verma@example.test", contact_no: "+91 90000 00204", city: "Jaipur", listing_limit: 2, status: "inactive", registered_at: "2025-04-08" },
  { name: "Saanvi Joshi", email: "saanvi.joshi@example.test", contact_no: "+91 90000 00205", city: "Bengaluru", listing_limit: 6, status: "active", registered_at: "2025-05-11" },
];

const dealers = [
  { name: "Demo Motors Pune", email: "pune.dealer@example.test", contact_no: "+91 90000 00301" },
  { name: "Western Auto Hub", email: "mumbai.dealer@example.test", contact_no: "+91 90000 00302" },
  { name: "Pink City Cars", email: "jaipur.dealer@example.test", contact_no: "+91 90000 00303" },
  { name: "Southside Automobiles", email: "kochi.dealer@example.test", contact_no: "+91 90000 00304" },
  { name: "Capital Car Point", email: "delhi.dealer@example.test", contact_no: "+91 90000 00305" },
];

const listings = [
  { seller: 0, registration_no: "DEMO-01-AB-0101", ref_id: "DEMO-LST-101", brand: "Tata", model: "Nexon", model_year: 2022, variant: "XZ+", body_type: "SUV", fuel_type: "petrol", transmission: "manual", kilometers: 23000, color: "Slate Grey", price: 895000, registration_date: "2022-06-01", owner_count: 1, insurance_type: "Comprehensive", insurance_expiry: "2027-06-01", state: "Maharashtra", city: "Pune", seller_name: sellers[0].name, seller_mobile: sellers[0].contact_no, address: "Demo address, Pune", description: "Synthetic Tata Nexon listing for testing.", features: ["ABS", "Rear camera"], status: "available", is_featured: true, is_home: false },
  { seller: 1, registration_no: "DEMO-02-CD-0102", ref_id: "DEMO-LST-102", brand: "Maruti Suzuki", model: "Swift", model_year: 2021, variant: "VXi", body_type: "Hatchback", fuel_type: "petrol", transmission: "manual", kilometers: 31000, color: "Pearl White", price: 620000, registration_date: "2021-03-14", owner_count: 1, insurance_type: "Third party", insurance_expiry: "2026-03-14", state: "Maharashtra", city: "Mumbai", seller_name: sellers[1].name, seller_mobile: sellers[1].contact_no, address: "Demo address, Mumbai", description: "Synthetic Maruti Swift listing for testing.", features: ["Air conditioning", "Power steering"], status: "sold", is_featured: false, is_home: false },
  { seller: 2, registration_no: "DEMO-03-EF-0103", ref_id: "DEMO-LST-103", brand: "Hyundai", model: "Creta", model_year: 2023, variant: "SX", body_type: "SUV", fuel_type: "diesel", transmission: "automatic", kilometers: 14000, color: "Abyss Black", price: 1450000, registration_date: "2023-08-20", owner_count: 1, insurance_type: "Comprehensive", insurance_expiry: "2026-08-20", state: "Rajasthan", city: "Jaipur", seller_name: sellers[2].name, seller_mobile: sellers[2].contact_no, address: "Demo address, Jaipur", description: "Synthetic Hyundai Creta listing for testing.", features: ["Sunroof", "Cruise control"], status: "reserved", is_featured: true, is_home: true },
  { seller: 3, registration_no: "DEMO-04-GH-0104", ref_id: "DEMO-LST-104", brand: "Honda", model: "City", model_year: 2020, variant: "VX", body_type: "Sedan", fuel_type: "petrol", transmission: "cvt", kilometers: 42000, color: "Modern Steel", price: 930000, registration_date: "2020-11-05", owner_count: 2, insurance_type: "Comprehensive", insurance_expiry: "2026-11-05", state: "Karnataka", city: "Bengaluru", seller_name: sellers[3].name, seller_mobile: sellers[3].contact_no, address: "Demo address, Bengaluru", description: "Synthetic Honda City listing for testing.", features: ["Touchscreen", "Alloy wheels"], status: "draft", is_featured: false, is_home: false },
  { seller: 4, registration_no: "DEMO-05-JK-0105", ref_id: "DEMO-LST-105", brand: "Mahindra", model: "XUV300", model_year: 2022, variant: "W8", body_type: "SUV", fuel_type: "diesel", transmission: "manual", kilometers: 27000, color: "Red Rage", price: 980000, registration_date: "2022-09-17", owner_count: 1, insurance_type: "Comprehensive", insurance_expiry: "2027-09-17", state: "Delhi", city: "Delhi", seller_name: sellers[4].name, seller_mobile: sellers[4].contact_no, address: "Demo address, Delhi", description: "Synthetic Mahindra XUV300 listing for testing.", features: ["Airbags", "Rear camera"], status: "available", is_featured: false, is_home: false },
];

const quickListings = [
  { ref_id: "DEMO-QL-101", registration_no: "DEMO-06-LM-0106", customer_name: "Synthetic Contact 1", mobile: "+91 90000 00401", address: "Demo address, Pune", city: "Pune", state: "Maharashtra", pincode: "411001", brand: "Hyundai", model: "i20", variant: "Sportz", price: 640000, appointment_at: "2026-11-10 10:00:00", inspection_status: "pending" },
  { ref_id: "DEMO-QL-102", registration_no: "DEMO-07-NO-0107", customer_name: "Synthetic Contact 2", mobile: "+91 90000 00402", address: "Demo address, Mumbai", city: "Mumbai", state: "Maharashtra", pincode: "400001", brand: "Tata", model: "Punch", variant: "Adventure", price: 720000, appointment_at: "2026-11-11 11:30:00", inspection_status: "inspecting" },
  { ref_id: "DEMO-QL-103", registration_no: "DEMO-08-PQ-0108", customer_name: "Synthetic Contact 3", mobile: "+91 90000 00403", address: "Demo address, Jaipur", city: "Jaipur", state: "Rajasthan", pincode: "302001", brand: "Maruti Suzuki", model: "Baleno", variant: "Delta", price: 580000, appointment_at: "2026-11-12 09:00:00", inspection_status: "completed" },
  { ref_id: "DEMO-QL-104", registration_no: "DEMO-09-RS-0109", customer_name: "Synthetic Contact 4", mobile: "+91 90000 00404", address: "Demo address, Bengaluru", city: "Bengaluru", state: "Karnataka", pincode: "560001", brand: "Honda", model: "Amaze", variant: "S", price: 690000, appointment_at: "2026-11-13 14:00:00", inspection_status: "pending" },
  { ref_id: "DEMO-QL-105", registration_no: "DEMO-10-TU-0110", customer_name: "Synthetic Contact 5", mobile: "+91 90000 00405", address: "Demo address, Delhi", city: "Delhi", state: "Delhi", pincode: "110001", brand: "Kia", model: "Sonet", variant: "HTK", price: 890000, appointment_at: "2026-11-14 12:00:00", inspection_status: "inspecting" },
];

const inspections = [
  { ref_id: "DEMO-IN-101", listing: 0, registration_no: listings[0].registration_no, customer_name: "Synthetic Contact 1", mobile: "+91 90000 00401", status: "pending", scheduled_at: "2026-11-10 10:00:00", notes: "Synthetic inspection pending." },
  { ref_id: "DEMO-IN-102", listing: 1, registration_no: listings[1].registration_no, customer_name: "Synthetic Contact 2", mobile: "+91 90000 00402", status: "inspecting", scheduled_at: "2026-11-11 11:30:00", notes: "Synthetic inspection in progress." },
  { ref_id: "DEMO-IN-103", listing: 2, registration_no: listings[2].registration_no, customer_name: "Synthetic Contact 3", mobile: "+91 90000 00403", status: "completed", scheduled_at: "2026-11-12 09:00:00", notes: "Synthetic inspection completed." },
  { ref_id: "DEMO-IN-104", listing: 3, registration_no: listings[3].registration_no, customer_name: "Synthetic Contact 4", mobile: "+91 90000 00404", status: "pending", scheduled_at: "2026-11-13 14:00:00", notes: "Synthetic inspection pending." },
  { ref_id: "DEMO-IN-105", listing: 4, registration_no: listings[4].registration_no, customer_name: "Synthetic Contact 5", mobile: "+91 90000 00405", status: "inspecting", scheduled_at: "2026-11-14 12:00:00", notes: "Synthetic inspection in progress." },
];

const qualityChecks = [
  { ref_id: "DEMO-QC-101", inspection: 0, listing: 0, registration_no: listings[0].registration_no, customer_name: "Synthetic Contact 1", mobile: "+91 90000 00401", status: "pending", findings: "Synthetic quality check awaiting review." },
  { ref_id: "DEMO-QC-102", inspection: 1, listing: 1, registration_no: listings[1].registration_no, customer_name: "Synthetic Contact 2", mobile: "+91 90000 00402", status: "completed", findings: "Synthetic quality check passed." },
  { ref_id: "DEMO-QC-103", inspection: 2, listing: 2, registration_no: listings[2].registration_no, customer_name: "Synthetic Contact 3", mobile: "+91 90000 00403", status: "in_correction", findings: "Synthetic record needs a second review." },
  { ref_id: "DEMO-QC-104", inspection: 3, listing: 3, registration_no: listings[3].registration_no, customer_name: "Synthetic Contact 4", mobile: "+91 90000 00404", status: "pending", findings: "Synthetic quality check awaiting review." },
  { ref_id: "DEMO-QC-105", inspection: 4, listing: 4, registration_no: listings[4].registration_no, customer_name: "Synthetic Contact 5", mobile: "+91 90000 00405", status: "completed", findings: "Synthetic quality check passed." },
];

const repairs = [
  { registration_no: "DEMO-11-VW-0111", customer_name: "Synthetic Contact 1", mobile: "+91 90000 00501", address: "Demo address, Pune", city: "Pune", state: "Maharashtra", pincode: "411001", brand: "Maruti Suzuki", model: "Baleno", variant: "Delta", work_type: "Scheduled service", scheduled_date: "2026-11-15", status: "requested", notes: "Synthetic repair request." },
  { registration_no: "DEMO-12-XY-0112", customer_name: "Synthetic Contact 2", mobile: "+91 90000 00502", address: "Demo address, Mumbai", city: "Mumbai", state: "Maharashtra", pincode: "400001", brand: "Tata", model: "Nexon", variant: "XZ+", work_type: "Brake inspection", scheduled_date: "2026-11-16", status: "scheduled", notes: "Synthetic repair booking." },
  { registration_no: "DEMO-13-ZA-0113", customer_name: "Synthetic Contact 3", mobile: "+91 90000 00503", address: "Demo address, Jaipur", city: "Jaipur", state: "Rajasthan", pincode: "302001", brand: "Hyundai", model: "Creta", variant: "SX", work_type: "Bodywork", scheduled_date: "2026-11-17", status: "in_progress", notes: "Synthetic repair in progress." },
  { registration_no: "DEMO-14-BC-0114", customer_name: "Synthetic Contact 4", mobile: "+91 90000 00504", address: "Demo address, Bengaluru", city: "Bengaluru", state: "Karnataka", pincode: "560001", brand: "Honda", model: "City", variant: "VX", work_type: "Oil change", scheduled_date: "2026-11-18", status: "completed", notes: "Synthetic repair completed." },
  { registration_no: "DEMO-15-DE-0115", customer_name: "Synthetic Contact 5", mobile: "+91 90000 00505", address: "Demo address, Delhi", city: "Delhi", state: "Delhi", pincode: "110001", brand: "Mahindra", model: "XUV300", variant: "W8", work_type: "Battery replacement", scheduled_date: "2026-11-19", status: "cancelled", notes: "Synthetic repair cancelled." },
];

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

export async function seedMysqlDemoData(adminId: number): Promise<void> {
  const sellerIds: number[] = [];
  for (const seller of sellers) {
    sellerIds.push(await insertByUniqueKey(
      "sellers", "email", seller.email,
      ["name", "email", "contact_no", "city", "status", "registered_at"],
      [seller.name, seller.email, seller.contact_no, seller.city, seller.status, seller.registered_at],
    ));
  }
  for (const buyer of buyers) {
    await insertByUniqueKey(
      "buyers", "email", buyer.email,
      ["name", "email", "contact_no", "city", "listing_limit", "status", "registered_at"],
      [buyer.name, buyer.email, buyer.contact_no, buyer.city, buyer.listing_limit, buyer.status, buyer.registered_at],
    );
  }
  for (const dealer of dealers) {
    await insertByUniqueKey(
      "dealers", "email", dealer.email,
      ["name", "email", "contact_no"],
      [dealer.name, dealer.email, dealer.contact_no],
    );
  }
  const listingIds: number[] = [];
  for (let index = 0; index < listings.length; index += 1) {
    const listing = listings[index];
    listingIds.push(await insertByUniqueKey(
      "listings", "registration_no", listing.registration_no,
      ["registration_no", "seller_id", "ref_id", "brand", "model", "model_year", "variant", "body_type", "fuel_type", "transmission", "kilometers", "color", "price", "registration_date", "owner_count", "insurance_type", "insurance_expiry", "state", "city", "seller_name", "seller_mobile", "address", "description", "features", "status", "is_featured", "is_home"],
      [listing.registration_no, sellerIds[listing.seller], listing.ref_id, listing.brand, listing.model, listing.model_year, listing.variant, listing.body_type, listing.fuel_type, listing.transmission, listing.kilometers, listing.color, listing.price, listing.registration_date, listing.owner_count, listing.insurance_type, listing.insurance_expiry, listing.state, listing.city, listing.seller_name, listing.seller_mobile, listing.address, listing.description, JSON.stringify(listing.features), listing.status, listing.is_featured, listing.is_home],
    ));
  }
  const quickIds: number[] = [];
  for (const quick of quickListings) {
    quickIds.push(await insertByUniqueKey(
      "quick_listings", "ref_id", quick.ref_id,
      ["ref_id", "registration_no", "customer_name", "mobile", "address", "city", "state", "pincode", "brand", "model", "variant", "price", "appointment_at", "inspection_status"],
      [quick.ref_id, quick.registration_no, quick.customer_name, quick.mobile, quick.address, quick.city, quick.state, quick.pincode, quick.brand, quick.model, quick.variant, quick.price, quick.appointment_at, quick.inspection_status],
    ));
  }
  const inspectionIds: number[] = [];
  for (const inspection of inspections) {
    inspectionIds.push(await insertByUniqueKey(
      "inspections", "ref_id", inspection.ref_id,
      ["listing_id", "quick_listing_id", "ref_id", "registration_no", "customer_name", "mobile", "status", "scheduled_at", "notes"],
      [listingIds[inspection.listing], quickIds[inspection.listing], inspection.ref_id, inspection.registration_no, inspection.customer_name, inspection.mobile, inspection.status, inspection.scheduled_at, inspection.notes],
    ));
  }
  for (const check of qualityChecks) {
    await insertByUniqueKey(
      "quality_checks", "ref_id", check.ref_id,
      ["inspection_id", "listing_id", "ref_id", "registration_no", "customer_name", "mobile", "status", "findings"],
      [inspectionIds[check.inspection], listingIds[check.listing], check.ref_id, check.registration_no, check.customer_name, check.mobile, check.status, check.findings],
    );
  }
  for (const repair of repairs) {
    const [existing] = await pool.execute<Array<RowDataPacket & { id: number }>>(
      "SELECT id FROM repairs WHERE registration_no = ? LIMIT 1",
      [repair.registration_no],
    );
    if (!existing[0]) {
      await pool.execute(
        `INSERT INTO repairs (registration_no, customer_name, mobile, address, city, state, pincode, brand, model, variant, work_type, scheduled_date, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [repair.registration_no, repair.customer_name, repair.mobile, repair.address, repair.city, repair.state, repair.pincode, repair.brand, repair.model, repair.variant, repair.work_type, repair.scheduled_date, repair.status, repair.notes],
      );
    }
  }
  const [qualityRows] = await pool.execute<Array<RowDataPacket & { id: number }>>(
    "SELECT id FROM quality_checks WHERE ref_id = ? LIMIT 1",
    ["DEMO-QC-101"],
  );
  if (!qualityRows[0]) throw new Error("Unable to resolve seeded quality check.");
  const approvalFixtures = [
    {
      resource: "inspections",
      resourceId: inspectionIds[0],
      fromStatus: "pending",
      toStatus: "inspecting",
      note: "Synthetic approval request for testing.",
    },
    {
      resource: "quality-checks",
      resourceId: qualityRows[0].id,
      fromStatus: "pending",
      toStatus: "completed",
      note: "Synthetic quality approval request for testing.",
    },
  ];
  for (const fixture of approvalFixtures) {
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM status_change_requests
       WHERE resource = ? AND resource_id = ? AND note = ? LIMIT 1`,
      [fixture.resource, fixture.resourceId, fixture.note],
    );
    if (!existing[0]) {
      await pool.execute(
        `INSERT INTO status_change_requests
          (resource, resource_id, from_status, to_status, note, requested_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fixture.resource, fixture.resourceId, fixture.fromStatus, fixture.toStatus, fixture.note, adminId],
      );
    }
  }
}

function localRecord(
  database: LocalDatabase,
  store: LocalJsonStore,
  resource: ResourceName,
  key: string,
  values: Record<string, unknown>,
): LocalRecord {
  const existing = database.records[resource].find(
    (record) => String(record[key]) === String(values[key]),
  );
  if (existing) return existing;
  const timestamp = new Date().toISOString();
  const record = {
    ...values,
    id: store.nextId(database, resource),
    created_at: timestamp,
    updated_at: timestamp,
  };
  database.records[resource].push(record);
  return record;
}

export async function seedLocalDemoData(
  store: LocalJsonStore = localStore,
): Promise<void> {
  await store.update((database) => {
    const sellerRecords = demoData.sellers.map((seller) =>
      localRecord(database, store, "sellers", "email", seller),
    );
    demoData.buyers.forEach((buyer) =>
      localRecord(database, store, "buyers", "email", buyer),
    );
    demoData.dealers.forEach((dealer) =>
      localRecord(database, store, "dealers", "email", dealer),
    );
    const listingRecords = demoData.listings.map((listing) => {
      const { seller, ...values } = listing;
      return localRecord(database, store, "listings", "registration_no", {
        ...values,
        seller_id: sellerRecords[seller].id,
      });
    });
    const quickRecords = demoData.quickListings.map((quick) =>
      localRecord(database, store, "quick-listings", "ref_id", quick),
    );
    const inspectionRecords = demoData.inspections.map((inspection) => {
      const { listing, ...values } = inspection;
      return localRecord(database, store, "inspections", "ref_id", {
        ...values,
        listing_id: listingRecords[listing].id,
        quick_listing_id: quickRecords[listing].id,
      });
    });
    demoData.qualityChecks.forEach((check) => {
      const { inspection, listing, ...values } = check;
      localRecord(database, store, "quality-checks", "ref_id", {
        ...values,
        inspection_id: inspectionRecords[inspection].id,
        listing_id: listingRecords[listing].id,
      });
    });
    demoData.repairs.forEach((repair) =>
      localRecord(database, store, "repairs", "registration_no", repair),
    );

    const requester = database.admins.find((admin) => admin.active);
    if (!requester) throw new Error("A local administrator is required to seed approvals.");
    const qualityCheck = database.records["quality-checks"].find(
      (record) => record.ref_id === "DEMO-QC-101",
    );
    if (!qualityCheck) throw new Error("Unable to resolve seeded quality check.");
    for (const fixture of demoData.statusRequests) {
      if (
        fixture.resource !== "inspections" &&
        fixture.resource !== "quality-checks"
      ) {
        throw new Error(`Unsupported demo approval resource: ${fixture.resource}.`);
      }
      const resource = fixture.resource;
      const resourceRecords =
        resource === "inspections"
          ? database.records.inspections
          : database.records["quality-checks"];
      const resourceRecord = resourceRecords.find(
        (record) => record.ref_id === fixture.resource_ref_id,
      );
      if (!resourceRecord) {
        throw new Error(
          `Unable to resolve demo ${resource} ${fixture.resource_ref_id}.`,
        );
      }
      const exists = database.statusRequests.some(
        (request) =>
          request.resource === resource &&
          request.resourceId === resourceRecord.id &&
          request.note === fixture.note,
      );
      if (!exists) {
        database.statusRequests.push({
          id: store.nextId(database, "statusRequests"),
          resource,
          resourceId: resourceRecord.id,
          fromStatus: fixture.fromStatus,
          toStatus: fixture.toStatus,
          note: fixture.note,
          status: "pending",
          requestedBy: requester.id,
          reviewedBy: null,
          requestedAt: new Date().toISOString(),
          reviewedAt: null,
        });
      }
    }
  });
}
