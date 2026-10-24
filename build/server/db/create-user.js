"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const pool_1 = require("./pool");
const userInput = zod_1.z.object({
    NEW_USER_NAME: zod_1.z.string().trim().min(1).max(120),
    NEW_USER_EMAIL: zod_1.z.string().trim().email().max(254).toLowerCase(),
    NEW_USER_PASSWORD: zod_1.z.string().min(12).max(200),
    NEW_USER_ROLE: zod_1.z.enum(["admin", "operations", "inspector"]),
});
async function createUser() {
    const input = userInput.parse(process.env);
    const passwordHash = await bcryptjs_1.default.hash(input.NEW_USER_PASSWORD, 12);
    await pool_1.pool.execute(`INSERT INTO admins (name, email, password_hash, role, active)
     VALUES (?, ?, ?, ?, TRUE)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = VALUES(role), active = TRUE`, [
        input.NEW_USER_NAME,
        input.NEW_USER_EMAIL,
        passwordHash,
        input.NEW_USER_ROLE,
    ]);
    console.info(`Provisioned ${input.NEW_USER_ROLE} account.`);
}
createUser()
    .catch((error) => {
    console.error("Account provisioning failed.", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
})
    .finally(async () => {
    await pool_1.pool.end();
});
