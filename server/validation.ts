import { z } from "zod";

const shortText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
const phone = z
  .string()
  .trim()
  .regex(/^[+0-9() -]{7,24}$/);
const email = z.string().trim().email().max(254).toLowerCase();
const date = z.string().date();
const id = z.number().int().positive();
const money = z.number().finite().min(0).max(9999999999.99);

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(200),
    rememberMe: z.boolean().default(false),
  })
  .strict();

export const profileUpdateSchema = z
  .object({
    name: shortText(120),
    email,
    currentPassword: z.string().max(200).optional(),
    newPassword: z.string().min(12).max(200).optional(),
  })
  .strict()
  .refine((value) => !value.newPassword || Boolean(value.currentPassword), {
    message: "Current password is required to change the password.",
    path: ["currentPassword"],
  });

const listingSchema = z
  .object({
    registration_no: shortText(24).toUpperCase(),
    seller_id: id.nullable().optional(),
    ref_id: shortText(32).toUpperCase(),
    brand: shortText(80),
    model: shortText(100),
    model_year: z
      .number()
      .int()
      .min(1950)
      .max(new Date().getFullYear() + 1),
    variant: shortText(120),
    body_type: shortText(60),
    fuel_type: z.enum(["petrol", "diesel", "electric", "hybrid", "cng", "lpg"]),
    transmission: z.enum(["manual", "automatic", "amt", "cvt"]),
    kilometers: z.number().int().min(0).max(2000000),
    color: shortText(50),
    price: money,
    registration_date: date,
    owner_count: z.number().int().min(1).max(20),
    insurance_type: shortText(60),
    insurance_expiry: date.nullable().optional(),
    state: shortText(100),
    city: shortText(100),
    seller_name: shortText(160),
    seller_mobile: phone,
    address: shortText(255),
    description: z.string().trim().min(1).max(10000),
    features: z.array(shortText(80)).max(100).default([]),
    status: z
      .enum(["draft", "available", "reserved", "sold", "archived"])
      .default("available"),
    is_featured: z.boolean().default(false),
    is_home: z.boolean().default(false),
  })
  .strict();

const dealerSchema = z
  .object({
    name: shortText(160),
    email,
    contact_no: phone,
  })
  .strict();

const buyerSchema = z
  .object({
    name: shortText(160),
    email,
    contact_no: phone,
    city: shortText(100),
    listing_limit: z.number().int().min(0).max(10000).default(0),
    status: z.enum(["active", "inactive", "pending"]).default("active"),
    registered_at: date,
  })
  .strict();

const sellerSchema = z
  .object({
    name: shortText(160),
    email,
    contact_no: phone,
    city: shortText(100),
    status: z.enum(["active", "inactive", "pending"]).default("active"),
    registered_at: date,
  })
  .strict();

const quickListingSchema = z
  .object({
    ref_id: shortText(32).toUpperCase(),
    registration_no: shortText(24).toUpperCase(),
    customer_name: shortText(160),
    mobile: phone,
    address: shortText(255),
    city: shortText(100),
    state: shortText(100),
    pincode: z
      .string()
      .trim()
      .regex(/^\d{4,12}$/),
    brand: shortText(80),
    model: shortText(100),
    variant: shortText(120),
    price: money,
    appointment_at: z.string().datetime().nullable().optional(),
    assigned_to: id.nullable().optional(),
  })
  .strict();

const inspectionSchema = z
  .object({
    listing_id: id.nullable().optional(),
    quick_listing_id: id.nullable().optional(),
    ref_id: shortText(32).toUpperCase(),
    registration_no: shortText(24).toUpperCase(),
    customer_name: shortText(160),
    mobile: phone,
    assigned_to: id.nullable().optional(),
    scheduled_at: z.string().datetime().nullable().optional(),
    notes: optionalText(10000),
  })
  .strict();

const qualitySchema = z
  .object({
    inspection_id: id.nullable().optional(),
    listing_id: id.nullable().optional(),
    ref_id: shortText(32).toUpperCase(),
    registration_no: shortText(24).toUpperCase(),
    customer_name: shortText(160),
    mobile: phone,
    assigned_to: id.nullable().optional(),
    findings: optionalText(10000),
  })
  .strict();

const repairSchema = z
  .object({
    registration_no: shortText(24).toUpperCase(),
    customer_name: shortText(160),
    mobile: phone,
    address: shortText(255),
    city: shortText(100),
    state: shortText(100),
    pincode: z
      .string()
      .trim()
      .regex(/^\d{4,12}$/),
    brand: shortText(80),
    model: shortText(100),
    variant: shortText(120),
    work_type: shortText(120),
    scheduled_date: date,
    status: z
      .enum(["requested", "scheduled", "in_progress", "completed", "cancelled"])
      .default("requested"),
    notes: optionalText(10000),
  })
  .strict();

export const resourceSchemas = {
  listings: listingSchema,
  dealers: dealerSchema,
  buyers: buyerSchema,
  sellers: sellerSchema,
  "quick-listings": quickListingSchema,
  inspections: inspectionSchema,
  "quality-checks": qualitySchema,
  repairs: repairSchema,
} as const;

export const statusRequestSchema = z
  .object({
    resource: z.enum(["inspections", "quality-checks", "quick-listings"]),
    resourceId: id,
    toStatus: z.string().trim().min(1).max(32),
    note: optionalText(500),
  })
  .strict();

export const reviewRequestSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
  })
  .strict();

export const listQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(""),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sort: z.string().max(40).default("created_at"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    status: z.string().trim().max(32).optional(),
  })
  .strict();
