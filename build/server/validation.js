"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listQuerySchema = exports.reviewRequestSchema = exports.statusRequestSchema = exports.resourceSchemas = exports.profileUpdateSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
const shortText = (max) => zod_1.z.string().trim().min(1).max(max);
const optionalText = (max) => zod_1.z.string().trim().max(max).nullable().optional();
const phone = zod_1.z
    .string()
    .trim()
    .regex(/^[+0-9() -]{7,24}$/);
const email = zod_1.z.string().trim().email().max(254).toLowerCase();
const date = zod_1.z.string().date();
const id = zod_1.z.number().int().positive();
const money = zod_1.z.number().finite().min(0).max(9999999999.99);
exports.loginSchema = zod_1.z
    .object({
    email,
    password: zod_1.z.string().min(1).max(200),
    rememberMe: zod_1.z.boolean().default(false),
})
    .strict();
exports.profileUpdateSchema = zod_1.z
    .object({
    name: shortText(120),
    email,
    currentPassword: zod_1.z.string().max(200).optional(),
    newPassword: zod_1.z.string().min(12).max(200).optional(),
})
    .strict()
    .refine((value) => !value.newPassword || Boolean(value.currentPassword), {
    message: "Current password is required to change the password.",
    path: ["currentPassword"],
});
const listingSchema = zod_1.z
    .object({
    registration_no: shortText(24).toUpperCase(),
    seller_id: id.nullable().optional(),
    ref_id: shortText(32).toUpperCase(),
    brand: shortText(80),
    model: shortText(100),
    model_year: zod_1.z
        .number()
        .int()
        .min(1950)
        .max(new Date().getFullYear() + 1),
    variant: shortText(120),
    body_type: shortText(60),
    fuel_type: zod_1.z.enum(["petrol", "diesel", "electric", "hybrid", "cng", "lpg"]),
    transmission: zod_1.z.enum(["manual", "automatic", "amt", "cvt"]),
    kilometers: zod_1.z.number().int().min(0).max(2000000),
    color: shortText(50),
    price: money,
    registration_date: date,
    owner_count: zod_1.z.number().int().min(1).max(20),
    insurance_type: shortText(60),
    insurance_expiry: date.nullable().optional(),
    state: shortText(100),
    city: shortText(100),
    seller_name: shortText(160),
    seller_mobile: phone,
    address: shortText(255),
    description: zod_1.z.string().trim().min(1).max(10000),
    features: zod_1.z.array(shortText(80)).max(100).default([]),
    status: zod_1.z
        .enum(["draft", "available", "reserved", "sold", "archived"])
        .default("available"),
    is_featured: zod_1.z.boolean().default(false),
    is_home: zod_1.z.boolean().default(false),
})
    .strict();
const dealerSchema = zod_1.z
    .object({
    name: shortText(160),
    email,
    contact_no: phone,
})
    .strict();
const buyerSchema = zod_1.z
    .object({
    name: shortText(160),
    email,
    contact_no: phone,
    city: shortText(100),
    listing_limit: zod_1.z.number().int().min(0).max(10000).default(0),
    status: zod_1.z.enum(["active", "inactive", "pending"]).default("active"),
    registered_at: date,
})
    .strict();
const sellerSchema = zod_1.z
    .object({
    name: shortText(160),
    email,
    contact_no: phone,
    city: shortText(100),
    status: zod_1.z.enum(["active", "inactive", "pending"]).default("active"),
    registered_at: date,
})
    .strict();
const quickListingSchema = zod_1.z
    .object({
    ref_id: shortText(32).toUpperCase(),
    registration_no: shortText(24).toUpperCase(),
    customer_name: shortText(160),
    mobile: phone,
    address: shortText(255),
    city: shortText(100),
    state: shortText(100),
    pincode: zod_1.z
        .string()
        .trim()
        .regex(/^\d{4,12}$/),
    brand: shortText(80),
    model: shortText(100),
    variant: shortText(120),
    price: money,
    appointment_at: zod_1.z.string().datetime().nullable().optional(),
    assigned_to: id.nullable().optional(),
})
    .strict();
const inspectionSchema = zod_1.z
    .object({
    listing_id: id.nullable().optional(),
    quick_listing_id: id.nullable().optional(),
    ref_id: shortText(32).toUpperCase(),
    registration_no: shortText(24).toUpperCase(),
    customer_name: shortText(160),
    mobile: phone,
    assigned_to: id.nullable().optional(),
    scheduled_at: zod_1.z.string().datetime().nullable().optional(),
    notes: optionalText(10000),
})
    .strict();
const qualitySchema = zod_1.z
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
const repairSchema = zod_1.z
    .object({
    registration_no: shortText(24).toUpperCase(),
    customer_name: shortText(160),
    mobile: phone,
    address: shortText(255),
    city: shortText(100),
    state: shortText(100),
    pincode: zod_1.z
        .string()
        .trim()
        .regex(/^\d{4,12}$/),
    brand: shortText(80),
    model: shortText(100),
    variant: shortText(120),
    work_type: shortText(120),
    scheduled_date: date,
    status: zod_1.z
        .enum(["requested", "scheduled", "in_progress", "completed", "cancelled"])
        .default("requested"),
    notes: optionalText(10000),
})
    .strict();
exports.resourceSchemas = {
    listings: listingSchema,
    dealers: dealerSchema,
    buyers: buyerSchema,
    sellers: sellerSchema,
    "quick-listings": quickListingSchema,
    inspections: inspectionSchema,
    "quality-checks": qualitySchema,
    repairs: repairSchema,
};
exports.statusRequestSchema = zod_1.z
    .object({
    resource: zod_1.z.enum(["inspections", "quality-checks", "quick-listings"]),
    resourceId: id,
    toStatus: zod_1.z.string().trim().min(1).max(32),
    note: optionalText(500),
})
    .strict();
exports.reviewRequestSchema = zod_1.z
    .object({
    decision: zod_1.z.enum(["approved", "rejected"]),
})
    .strict();
exports.listQuerySchema = zod_1.z
    .object({
    q: zod_1.z.string().trim().max(120).default(""),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(10),
    sort: zod_1.z.string().max(40).default("created_at"),
    direction: zod_1.z.enum(["asc", "desc"]).default("desc"),
    status: zod_1.z.string().trim().max(32).optional(),
})
    .strict();
