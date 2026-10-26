import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z
    .string()
    .url()
    .transform((value) => new URL(value).origin)
    .default("http://localhost:5173"),
  MYSQL_HOST: z.string().default("127.0.0.1"),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_DATABASE: z
    .string()
    .regex(/^[a-zA-Z0-9_]+$/)
    .default("cocacars_admin"),
  MYSQL_USER: z.string().default("cocacars_app"),
  MYSQL_PASSWORD: z.string().default(""),
  LOCAL_DATA_FILE: z.string().default("data/local-db.json"),
  LOCAL_ADMIN_EMAIL: z.string().email().default("admin@gmail.com"),
  LOCAL_ADMIN_PASSWORD: z.string().min(1).default("Admin@123"),
  SEED_DEMO_DATA: z.enum(["true", "false"]).default("false"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default(process.env.NODE_ENV === "production" ? "true" : "false"),
  COOKIE_SAME_SITE: z
    .enum(["strict", "lax", "none"])
    .default(process.env.NODE_ENV === "production" ? "none" : "strict"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(12).optional(),
}).superRefine((value, context) => {
  if (value.COOKIE_SAME_SITE === "none" && value.COOKIE_SECURE !== "true") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["COOKIE_SECURE"],
      message: "COOKIE_SECURE must be true when COOKIE_SAME_SITE is none.",
    });
  }
});

export const config = envSchema.parse(process.env);
