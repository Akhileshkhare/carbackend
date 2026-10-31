"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z
        .enum(["development", "test", "production"])
        .default("development"),
    PORT: zod_1.z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: zod_1.z
        .string()
        .url()
        .transform((value) => new URL(value).origin)
        .default("http://localhost:5173"),
    MYSQL_HOST: zod_1.z.string().default("127.0.0.1"),
    MYSQL_PORT: zod_1.z.coerce.number().int().positive().default(3306),
    MYSQL_DATABASE: zod_1.z
        .string()
        .regex(/^[a-zA-Z0-9_]+$/)
        .default("cocacars_admin"),
    STORAGE_MODE: zod_1.z
        .enum(["auto", "mysql", "json"])
        .default(process.env.NODE_ENV === "production" ? "json" : "auto"),
    MYSQL_USER: zod_1.z.string().default("cocacars_app"),
    MYSQL_PASSWORD: zod_1.z.string().default(""),
    LOCAL_DATA_FILE: zod_1.z.string().default("data/local-db.json"),
    LOCAL_UPLOAD_DIR: zod_1.z.string().default("data/uploads"),
    LOCAL_ADMIN_EMAIL: zod_1.z.string().email().default("admin@gmail.com"),
    LOCAL_ADMIN_PASSWORD: zod_1.z.string().min(1).default("Admin@123"),
    SEED_DEMO_DATA: zod_1.z.enum(["true", "false"]).default("false"),
    COOKIE_SECURE: zod_1.z
        .enum(["true", "false"])
        .default(process.env.NODE_ENV === "production" ? "true" : "false"),
    COOKIE_SAME_SITE: zod_1.z
        .enum(["strict", "lax", "none"])
        .default(process.env.NODE_ENV === "production" ? "none" : "strict"),
    LOG_LEVEL: zod_1.z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),
    SEED_ADMIN_EMAIL: zod_1.z.string().email().optional(),
    SEED_ADMIN_PASSWORD: zod_1.z.string().min(12).optional(),
}).superRefine((value, context) => {
    if (value.COOKIE_SAME_SITE === "none" && value.COOKIE_SECURE !== "true") {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["COOKIE_SECURE"],
            message: "COOKIE_SECURE must be true when COOKIE_SAME_SITE is none.",
        });
    }
});
exports.config = envSchema.parse(process.env);
