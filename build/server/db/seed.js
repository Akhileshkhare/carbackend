"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const config_1 = require("../config");
const local_store_1 = require("./local-store");
const pool_1 = require("./pool");
const demo_data_1 = require("./demo-data");
async function seedMysql() {
    if (!config_1.config.SEED_ADMIN_EMAIL || !config_1.config.SEED_ADMIN_PASSWORD) {
        throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set before seeding MySQL.");
    }
    const adminEmail = config_1.config.SEED_ADMIN_EMAIL.toLowerCase();
    const adminHash = await bcryptjs_1.default.hash(config_1.config.SEED_ADMIN_PASSWORD, 12);
    await pool_1.pool.execute(`INSERT INTO admins (name, email, password_hash, role, active)
     VALUES (?, ?, ?, 'admin', TRUE)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = 'admin', active = TRUE`, ["AutoSureX Administrator", adminEmail, adminHash]);
    const [rows] = await pool_1.pool.execute("SELECT id FROM admins WHERE email = ? LIMIT 1", [adminEmail]);
    if (!rows[0])
        throw new Error("Unable to resolve the seeded administrator.");
    await (0, demo_data_1.seedMysqlDemoData)(rows[0].id);
}
async function seedLocal() {
    const store = new local_store_1.LocalJsonStore();
    await store.initialize(await bcryptjs_1.default.hash(config_1.config.LOCAL_ADMIN_PASSWORD, 12));
    await (0, demo_data_1.seedLocalDemoData)(store);
}
async function seed() {
    try {
        await pool_1.pool.query("SELECT 1");
    }
    catch (error) {
        console.warn("MySQL is unavailable; seeding the configured local JSON store instead.", error instanceof Error ? error.message : "Unknown connection error");
        await seedLocal();
        console.info("Seeded synthetic demo records in local JSON storage.");
        return;
    }
    await seedMysql();
    console.info("Seeded synthetic demo records in MySQL.");
}
seed()
    .catch((error) => {
    console.error("Database seed failed.", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
})
    .finally(async () => {
    await pool_1.pool.end();
});
