import "server-only";
import crypto from "crypto";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { BRAND, MILESTONES, ECON } from "./config";
import { getPack, categoryName } from "./packs";
import { fmtDate } from "./format";

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Build the contract text from the booking's structured data + pack clause library. */
export async function buildContractBody(bookingId: string) {
  const b = await db.query.bookings.findFirst({
    where: eq(schema.bookings.id, bookingId),
    with: {
      event: true,
      vendor: { with: { user: true } },
      client: true,
      messages: { where: eq(schema.messages.pinned, true), orderBy: asc(schema.messages.createdAt) },
    },
  });
  if (!b) throw new Error("Booking not found");
  const pack = getPack(b.event.pack);
  const clauses = [...(pack.contractClauses.default ?? []), ...(pack.contractClauses[b.category] ?? [])];
  const amount = b.quoteAmount ?? 0;
  const deliverables = (b.quoteDetails || b.brief).split("\n").map((l) => l.trim()).filter(Boolean);

  return [
    `SERVICE AGREEMENT`,
    ``,
    `Agreement reference: ${b.id.toUpperCase()}`,
    `Facilitated by ${BRAND.name} (the "Platform").`,
    ``,
    `1. PARTIES`,
    `Client: ${b.client.name} (${b.client.email}${b.client.phone ? ", " + b.client.phone : ""})`,
    `Vendor: ${b.vendor.businessName}${b.vendor.cacNumber ? `, CAC ${b.vendor.cacNumber}` : ""}, ${b.vendor.city}, ${b.vendor.state}. Represented by ${b.vendor.user.name}.`,
    ``,
    `2. EVENT`,
    `${b.event.title} for ${b.event.hostNames} on ${fmtDate(b.event.date)} in ${b.event.city}${b.event.venueName ? " at " + b.event.venueName : ""}. Expected guests: ${b.event.guestCount}.`,
    ``,
    `3. SERVICE: ${categoryName(b.category, b.event.pack).toUpperCase()}`,
    `Schedule A, deliverables:`,
    ...deliverables.map((d, i) => `  A${i + 1}. ${d}`),
    ``,
    `4. PRICE AND PAYMENT`,
    `Total contract price: ₦${amount.toLocaleString()}. Payments are made through the Platform and held in escrow by its licensed payment partner until released under this agreement:`,
    ...MILESTONES.map((m) => `  - ${m.label}: ${m.percent}% (₦${Math.round((amount * m.percent) / 100).toLocaleString()})${m.earlyRelease ? ", may be released to the Vendor before the event for materials" : ""}`),
    `After the Vendor marks the service delivered, funds are released when the Client confirms, or automatically after ${ECON.autoReleaseHours} hours unless the Client opens a dispute.`,
    ``,
    `5. SERVICE TERMS`,
    ...clauses.map((c, i) => `  5.${i + 1} ${c}`),
    ``,
    `6. CANCELLATION`,
    `  - Client cancels more than 60 days before the event: all funds refunded except the commitment deposit.`,
    `  - Client cancels 15-60 days before: 50% of funds paid to date are refunded.`,
    `  - Client cancels under 15 days before: no refund of amounts paid to date.`,
    `  - Vendor cancels at any time: full refund of all amounts paid, and the Platform may arrange a replacement vendor.`,
    `  - Force majeure (including government restrictions, severe flooding, civil unrest): parties shall agree a new date in good faith; failing that, funds held in escrow are refunded less documented costs.`,
    ``,
    `7. DISPUTES`,
    `Either party may open a dispute on a milestone held in escrow. Evidence includes this agreement, pinned chat messages, delivery photos and gate scan records. The Platform mediates and may release funds in whole or in part. Unresolved disputes go to arbitration in Lagos under the Arbitration and Mediation Act 2023.`,
    ``,
    `8. DATA`,
    `Each party shall use the other's personal data only to perform this agreement, in line with the Nigeria Data Protection Act 2023.`,
    ...(b.messages.length
      ? [``, `9. ADDITIONAL TERMS AGREED IN CHAT`, ...b.messages.map((m, i) => `  9.${i + 1} ${m.body}`)]
      : []),
    ``,
    `Electronic signatures: each party signs by entering a one-time code sent to their verified phone/email. Signatures bind to the SHA-256 hash of this text.`,
  ].join("\n");
}

export const newOtp = () => String(crypto.randomInt(100000, 1000000));

/**
 * Deliver an OTP. In production, send via SMS (e.g. Termii) or WhatsApp. In development we
 * return it so the UI can display it.
 */
export async function sendOtp(to: { phone?: string | null; email: string }, code: string) {
  console.log(`[OTP] ${to.phone || to.email}: ${code}`);
  return process.env.NODE_ENV !== "production" || process.env.SHOW_DEV_OTP === "1" ? code : null;
}
