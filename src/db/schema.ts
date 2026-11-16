// Eventa platform data model (Drizzle ORM, PostgreSQL).
// Money is stored as whole Naira (integer). Convert to kobo only at the payment gateway.
import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { randomBytes } from "crypto";

const id = () => text("id").primaryKey().$defaultFn(() => randomBytes(9).toString("base64url"));
const createdAt = () => timestamp("created_at", { mode: "date" }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["CLIENT", "VENDOR", "ADMIN", "GATE"]);
export const tierEnum = pgEnum("vendor_tier", ["LISTED", "VERIFIED", "PRO"]);
export const kycEnum = pgEnum("kyc_status", ["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "REQUESTED",
  "QUOTED",
  "ACCEPTED",
  "CONTRACT_SIGNED",
  "IN_PROGRESS",
  "DELIVERED",
  "COMPLETED",
  "DISPUTED",
  "CANCELLED",
  "DECLINED",
]);
export const milestoneStatusEnum = pgEnum("milestone_status", ["PENDING", "FUNDED", "RELEASE_REQUESTED", "RELEASED", "REFUNDED", "DISPUTED"]);
export const ledgerAccountEnum = pgEnum("ledger_account", ["CLIENT", "ESCROW", "VENDOR", "PLATFORM"]);
export const guestCategoryEnum = pgEnum("guest_category", ["VIP", "FAMILY", "GENERAL", "CREW"]);
export const rsvpEnum = pgEnum("rsvp_status", ["PENDING", "YES", "NO"]);

export type Role = (typeof roleEnum.enumValues)[number];
export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];
export type MilestoneStatus = (typeof milestoneStatusEnum.enumValues)[number];
export type GuestCategory = (typeof guestCategoryEnum.enumValues)[number];

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("CLIENT"),
  createdAt: createdAt(),
});

export const vendors = pgTable(
  "vendors",
  {
    id: id(),
    userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    slug: text("slug").notNull().unique(),
    category: text("category").notNull(), // event-pack category key, e.g. CATERING
    city: text("city").notNull(),
    state: text("state").notNull(),
    description: text("description").notNull(),
    styles: text("styles").notNull().default(""), // comma-separated style tags
    serviceAreas: text("service_areas").notNull().default(""), // comma-separated cities
    priceFrom: integer("price_from").notNull(),
    priceUnit: text("price_unit").notNull().default("per event"),
    tier: tierEnum("tier").notNull().default("LISTED"),
    kycStatus: kycEnum("kyc_status").notNull().default("NOT_SUBMITTED"),
    cacNumber: text("cac_number"),
    idType: text("id_type"), // BVN or NIN
    idVerified: boolean("id_verified").notNull().default(false),
    bankName: text("bank_name"),
    bankAccountName: text("bank_account_name"),
    bankAccountNumber: text("bank_account_number"),
    payoutRecipient: text("payout_recipient"), // PSP transfer recipient / subaccount code
    rating: real("rating").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    completedBookings: integer("completed_bookings").notNull().default(0),
    disputesLost: integer("disputes_lost").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("vendors_cat_city").on(t.category, t.city)],
);

export const vendorPackages = pgTable("vendor_packages", {
  id: id(),
  vendorId: text("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(),
  unit: text("unit").notNull().default("per event"),
});

export const events = pgTable("events", {
  id: id(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pack: text("pack").notNull().default("wedding"), // event pack key: the core is event-agnostic
  title: text("title").notNull(),
  hostNames: text("host_names").notNull(),
  date: timestamp("date", { mode: "date" }).notNull(),
  city: text("city").notNull(),
  venueName: text("venue_name"),
  guestCount: integer("guest_count").notNull(),
  culture: text("culture").notNull(),
  ceremonies: text("ceremonies").notNull(), // comma-separated ceremony keys
  style: text("style").notNull().default(""),
  budget: integer("budget"), // null = let the AI propose one
  mustHaves: text("must_haves").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
});

export type PlanTier = {
  name: "Essential" | "Comfortable" | "Premium";
  contingencyPct: number;
  total: number;
  items: { category: string; description: string; amount: number }[];
};

export const plans = pgTable("plans", {
  id: id(),
  eventId: text("event_id").notNull().unique().references(() => events.id, { onDelete: "cascade" }),
  tier: text("tier").notNull().default("Comfortable"),
  totalBudget: integer("total_budget").notNull(),
  contingencyPct: integer("contingency_pct").notNull().default(10),
  summary: text("summary").notNull(),
  warnings: text("warnings").notNull().default(""), // newline-separated
  timeline: jsonb("timeline").$type<{ when: string; task: string }[]>().notNull().default([]),
  tiers: jsonb("tiers").$type<PlanTier[]>().notNull().default([]),
  source: text("source").notNull().default("ai"), // ai | template
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const planItems = pgTable("plan_items", {
  id: id(),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  locked: boolean("locked").notNull().default(false),
  vendorId: text("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  sort: integer("sort").notNull().default(0),
});

export type Proposal = { rationale: string; changes: { itemId: string; newAmount: number }[] };

export const assistantMessages = pgTable("assistant_messages", {
  id: id(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  proposal: jsonb("proposal").$type<Proposal | null>(),
  applied: boolean("applied").notNull().default(false),
  createdAt: createdAt(),
});

export const bookings = pgTable("bookings", {
  id: id(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  vendorId: text("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  brief: text("brief").notNull(),
  status: bookingStatusEnum("status").notNull().default("REQUESTED"),
  quoteAmount: integer("quote_amount"),
  quoteDetails: text("quote_details"), // newline-separated deliverables
  commissionPct: integer("commission_pct").notNull().default(10),
  deliveredAt: timestamp("delivered_at", { mode: "date" }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const messages = pgTable("messages", {
  id: id(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  pinned: boolean("pinned").notNull().default(false), // pinned messages are added to the contract
  system: boolean("system").notNull().default(false),
  createdAt: createdAt(),
});

export const contracts = pgTable("contracts", {
  id: id(),
  bookingId: text("booking_id").notNull().unique().references(() => bookings.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  bodyHash: text("body_hash").notNull(), // SHA-256 of body; signatures bind to this
  version: integer("version").notNull().default(1),
  clientOtpHash: text("client_otp_hash"),
  vendorOtpHash: text("vendor_otp_hash"),
  clientSignedAt: timestamp("client_signed_at", { mode: "date" }),
  vendorSignedAt: timestamp("vendor_signed_at", { mode: "date" }),
  clientSignIp: text("client_sign_ip"),
  vendorSignIp: text("vendor_sign_ip"),
  createdAt: createdAt(),
});

export const milestones = pgTable("milestones", {
  id: id(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  percent: integer("percent").notNull(),
  amount: integer("amount").notNull(),
  sort: integer("sort").notNull(),
  status: milestoneStatusEnum("status").notNull().default("PENDING"),
  earlyRelease: boolean("early_release").notNull().default(false),
  paymentRef: text("payment_ref").unique(),
  clientFee: integer("client_fee").notNull().default(0),
  fundedAt: timestamp("funded_at", { mode: "date" }),
  releaseAfter: timestamp("release_after", { mode: "date" }),
  releasedAt: timestamp("released_at", { mode: "date" }),
});

export const ledgerEntries = pgTable("ledger_entries", {
  id: id(),
  bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  milestoneId: text("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
  debit: ledgerAccountEnum("debit").notNull(),
  credit: ledgerAccountEnum("credit").notNull(),
  amount: integer("amount").notNull(),
  memo: text("memo").notNull(),
  ref: text("ref"),
  createdAt: createdAt(),
});

export const disputes = pgTable("disputes", {
  id: id(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  milestoneId: text("milestone_id").notNull().references(() => milestones.id, { onDelete: "cascade" }),
  openedById: text("opened_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN | RESOLVED
  vendorPercent: integer("vendor_percent"),
  resolution: text("resolution"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { mode: "date" }),
});

export const reviews = pgTable("reviews", {
  id: id(),
  bookingId: text("booking_id").notNull().unique().references(() => bookings.id, { onDelete: "cascade" }),
  vendorId: text("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  punctuality: integer("punctuality").notNull(),
  quality: integer("quality").notNull(),
  communication: integer("communication").notNull(),
  value: integer("value").notNull(),
  comment: text("comment").notNull(),
  vendorReply: text("vendor_reply"),
  createdAt: createdAt(),
});

export const seatTables = pgTable("seat_tables", {
  id: id(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  zone: text("zone").notNull().default("General"), // High table, VIP, Family, General, Crew
  sort: integer("sort").notNull().default(0),
});

export const guests = pgTable(
  "guests",
  {
    id: id(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    side: text("side").notNull().default("Both"), // Bride, Groom, Both
    group: text("group_name").notNull().default(""), // seat-together group
    category: guestCategoryEnum("category").notNull().default("GENERAL"),
    rsvp: rsvpEnum("rsvp").notNull().default("PENDING"),
    mealChoice: text("meal_choice"),
    token: text("token").notNull(), // secret on the QR access card
    tableId: text("table_id").references(() => seatTables.id, { onDelete: "set null" }),
    revoked: boolean("revoked").notNull().default(false),
    checkedInAt: timestamp("checked_in_at", { mode: "date" }),
    checkedInBy: text("checked_in_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("guests_token").on(t.token), index("guests_event").on(t.eventId)],
);

// ---------- Relations (for db.query.*.findMany({ with: ... })) ----------

export const usersRelations = relations(users, ({ one, many }) => ({
  vendor: one(vendors, { fields: [users.id], references: [vendors.userId] }),
  events: many(events),
}));

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  user: one(users, { fields: [vendors.userId], references: [users.id] }),
  packages: many(vendorPackages),
  bookings: many(bookings),
  reviews: many(reviews),
}));

export const vendorPackagesRelations = relations(vendorPackages, ({ one }) => ({
  vendor: one(vendors, { fields: [vendorPackages.vendorId], references: [vendors.id] }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  owner: one(users, { fields: [events.ownerId], references: [users.id] }),
  plan: one(plans, { fields: [events.id], references: [plans.eventId] }),
  bookings: many(bookings),
  guests: many(guests),
  tables: many(seatTables),
  assistant: many(assistantMessages),
}));

export const plansRelations = relations(plans, ({ one, many }) => ({
  event: one(events, { fields: [plans.eventId], references: [events.id] }),
  items: many(planItems),
}));

export const planItemsRelations = relations(planItems, ({ one }) => ({
  plan: one(plans, { fields: [planItems.planId], references: [plans.id] }),
  vendor: one(vendors, { fields: [planItems.vendorId], references: [vendors.id] }),
}));

export const assistantRelations = relations(assistantMessages, ({ one }) => ({
  event: one(events, { fields: [assistantMessages.eventId], references: [events.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  event: one(events, { fields: [bookings.eventId], references: [events.id] }),
  vendor: one(vendors, { fields: [bookings.vendorId], references: [vendors.id] }),
  client: one(users, { fields: [bookings.clientId], references: [users.id] }),
  contract: one(contracts, { fields: [bookings.id], references: [contracts.bookingId] }),
  review: one(reviews, { fields: [bookings.id], references: [reviews.bookingId] }),
  messages: many(messages),
  milestones: many(milestones),
  disputes: many(disputes),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  booking: one(bookings, { fields: [messages.bookingId], references: [bookings.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

export const contractsRelations = relations(contracts, ({ one }) => ({
  booking: one(bookings, { fields: [contracts.bookingId], references: [bookings.id] }),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  booking: one(bookings, { fields: [milestones.bookingId], references: [bookings.id] }),
  disputes: many(disputes),
}));

export const disputesRelations = relations(disputes, ({ one }) => ({
  booking: one(bookings, { fields: [disputes.bookingId], references: [bookings.id] }),
  milestone: one(milestones, { fields: [disputes.milestoneId], references: [milestones.id] }),
  openedBy: one(users, { fields: [disputes.openedById], references: [users.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  booking: one(bookings, { fields: [reviews.bookingId], references: [bookings.id] }),
  vendor: one(vendors, { fields: [reviews.vendorId], references: [vendors.id] }),
  client: one(users, { fields: [reviews.clientId], references: [users.id] }),
}));

export const seatTablesRelations = relations(seatTables, ({ one, many }) => ({
  event: one(events, { fields: [seatTables.eventId], references: [events.id] }),
  guests: many(guests),
}));

export const guestsRelations = relations(guests, ({ one }) => ({
  event: one(events, { fields: [guests.eventId], references: [events.id] }),
  table: one(seatTables, { fields: [guests.tableId], references: [seatTables.id] }),
}));

export type User = typeof users.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type Guest = typeof guests.$inferSelect;
export type SeatTable = typeof seatTables.$inferSelect;
