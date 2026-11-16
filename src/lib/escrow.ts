import "server-only";
import crypto from "crypto";
import { and, eq, inArray, lte, notInArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "./db";
import { ECON } from "./config";
import { payments } from "./payments/provider";

const { milestones: M, bookings: B, ledgerEntries: L } = schema;

export const clientFeeFor = (amount: number) => Math.round((amount * ECON.clientFeePct) / 100);

export const newPaymentRef = (milestoneId: string) =>
  `EVT-${milestoneId.slice(-6)}-${crypto.randomBytes(4).toString("hex")}`.toUpperCase();

async function sysMessage(tx: Tx, bookingId: string, senderId: string, body: string) {
  await tx.insert(schema.messages).values({ bookingId, senderId, body, system: true });
}

async function getMilestone(id: string) {
  const m = await db.query.milestones.findFirst({ where: eq(M.id, id), with: { booking: { with: { vendor: true } } } });
  if (!m) throw new Error("Milestone not found");
  return m;
}

/** Start a checkout for one milestone. Returns the PSP checkout URL. */
export async function startMilestonePayment(milestoneId: string, payerEmail: string) {
  const m = await getMilestone(milestoneId);
  if (m.status !== "PENDING") throw new Error("This milestone is not awaiting payment.");
  if (!["CONTRACT_SIGNED", "IN_PROGRESS", "DELIVERED"].includes(m.booking.status))
    throw new Error("Both parties must sign the contract before payment.");
  const fee = clientFeeFor(m.amount);
  const ref = newPaymentRef(m.id);
  await db.update(M).set({ paymentRef: ref, clientFee: fee }).where(eq(M.id, m.id));
  const { authorizationUrl } = await payments().initialize({
    amountNaira: m.amount + fee,
    email: payerEmail,
    reference: ref,
    metadata: { milestoneId: m.id, bookingId: m.bookingId },
  });
  return authorizationUrl;
}

/** Mark a milestone as funded after the PSP confirms payment. Idempotent. */
export async function confirmMilestonePayment(reference: string, verifiedAmount?: number) {
  return db.transaction(async (tx) => {
    const m = await tx.query.milestones.findFirst({ where: eq(M.paymentRef, reference), with: { booking: true } });
    if (!m) throw new Error("Unknown payment reference");
    if (m.status !== "PENDING") return m; // already processed (webhook + callback both fire)
    if (verifiedAmount && verifiedAmount > 0 && verifiedAmount < m.amount + m.clientFee)
      throw new Error("Paid amount is less than the amount due.");
    await tx.insert(L).values([
      { bookingId: m.bookingId, milestoneId: m.id, debit: "CLIENT", credit: "ESCROW", amount: m.amount, memo: `Escrow funded: ${m.label}`, ref: reference },
      ...(m.clientFee
        ? [{ bookingId: m.bookingId, milestoneId: m.id, debit: "CLIENT" as const, credit: "PLATFORM" as const, amount: m.clientFee, memo: "Client protection fee", ref: reference }]
        : []),
    ]);
    const deliveredAlready = m.booking.status === "DELIVERED";
    await tx
      .update(M)
      .set({
        status: deliveredAlready ? "RELEASE_REQUESTED" : "FUNDED",
        fundedAt: new Date(),
        releaseAfter: deliveredAlready ? new Date(Date.now() + ECON.autoReleaseHours * 3_600_000) : null,
      })
      .where(eq(M.id, m.id));
    if (m.booking.status === "CONTRACT_SIGNED") await tx.update(B).set({ status: "IN_PROGRESS" }).where(eq(B.id, m.bookingId));
    await sysMessage(tx, m.bookingId, m.booking.clientId, `💳 ${m.label} of ₦${m.amount.toLocaleString()} is now held in escrow.`);
    return m;
  });
}

/** Release a held milestone to the vendor, less platform commission; optionally refund part. */
export async function releaseMilestone(milestoneId: string, actorId: string, note = "Released to vendor", vendorPercent = 100) {
  const m = await getMilestone(milestoneId);
  if (!["FUNDED", "RELEASE_REQUESTED", "DISPUTED"].includes(m.status)) throw new Error("Only funds held in escrow can be released.");

  const toVendorGross = Math.round((m.amount * vendorPercent) / 100);
  const refund = m.amount - toVendorGross;
  const commission = Math.round((toVendorGross * m.booking.commissionPct) / 100);
  const vendorNet = toVendorGross - commission;

  const payout =
    vendorNet > 0
      ? await payments().payout({
          amountNaira: vendorNet,
          recipient: m.booking.vendor.payoutRecipient,
          reference: `PAYOUT-${m.id}`,
          reason: `${m.label} - ${m.booking.vendor.businessName}`,
        })
      : null;

  await db.transaction(async (tx) => {
    const entries: (typeof L.$inferInsert)[] = [];
    if (vendorNet > 0)
      entries.push({ bookingId: m.bookingId, milestoneId: m.id, debit: "ESCROW", credit: "VENDOR", amount: vendorNet, memo: `Payout: ${m.label}${payout?.status === "queued" ? " (queued: vendor payout account pending)" : ""}`, ref: payout?.transferRef });
    if (commission > 0) entries.push({ bookingId: m.bookingId, milestoneId: m.id, debit: "ESCROW", credit: "PLATFORM", amount: commission, memo: `Commission ${m.booking.commissionPct}%` });
    if (refund > 0) entries.push({ bookingId: m.bookingId, milestoneId: m.id, debit: "ESCROW", credit: "CLIENT", amount: refund, memo: `Refund ${100 - vendorPercent}%` });
    if (entries.length) await tx.insert(L).values(entries);
    await tx.update(M).set({ status: vendorPercent === 0 ? "REFUNDED" : "RELEASED", releasedAt: new Date() }).where(eq(M.id, m.id));
    await sysMessage(
      tx,
      m.bookingId,
      actorId,
      `✅ ${m.label}: ${note}. Vendor receives ₦${vendorNet.toLocaleString()} after commission${refund ? `; client refunded ₦${refund.toLocaleString()}` : ""}.`,
    );

    // Booking completes once every milestone is settled.
    const [{ remaining }] = await tx
      .select({ remaining: sql<number>`count(*)::int` })
      .from(M)
      .where(and(eq(M.bookingId, m.bookingId), notInArray(M.status, ["RELEASED", "REFUNDED"])));
    if (remaining === 0) {
      await tx.update(B).set({ status: "COMPLETED" }).where(eq(B.id, m.bookingId));
      await tx
        .update(schema.vendors)
        .set({ completedBookings: sql`${schema.vendors.completedBookings} + 1` })
        .where(eq(schema.vendors.id, m.booking.vendorId));
    }
  });
}

/** Vendor marks the service delivered: starts the auto-release clock on held milestones. */
export async function markDelivered(bookingId: string, vendorUserId: string) {
  const releaseAfter = new Date(Date.now() + ECON.autoReleaseHours * 3_600_000);
  await db.transaction(async (tx) => {
    await tx.update(B).set({ status: "DELIVERED", deliveredAt: new Date() }).where(eq(B.id, bookingId));
    await tx.update(M).set({ status: "RELEASE_REQUESTED", releaseAfter }).where(and(eq(M.bookingId, bookingId), eq(M.status, "FUNDED")));
    await sysMessage(
      tx,
      bookingId,
      vendorUserId,
      `📦 Vendor marked the service as delivered. Held funds release automatically in ${ECON.autoReleaseHours} hours unless the client confirms sooner or opens a dispute.`,
    );
  });
}

/** Release every milestone whose auto-release window has passed. Run from a cron job. */
export async function runAutoRelease(actorId: string) {
  const due = await db.select().from(M).where(and(eq(M.status, "RELEASE_REQUESTED"), lte(M.releaseAfter, new Date())));
  for (const m of due) await releaseMilestone(m.id, actorId, "Auto-released after the confirmation window");
  return due.length;
}

export async function openDispute(milestoneId: string, userId: string, reason: string) {
  const m = await getMilestone(milestoneId);
  if (!["FUNDED", "RELEASE_REQUESTED"].includes(m.status)) throw new Error("Only funds held in escrow can be disputed.");
  await db.transaction(async (tx) => {
    await tx.insert(schema.disputes).values({ bookingId: m.bookingId, milestoneId, openedById: userId, reason });
    await tx.update(M).set({ status: "DISPUTED" }).where(eq(M.id, milestoneId));
    await tx.update(B).set({ status: "DISPUTED" }).where(eq(B.id, m.bookingId));
    await sysMessage(tx, m.bookingId, userId, `⚠️ Dispute opened on "${m.label}": ${reason}. Payout is frozen for this milestone only.`);
  });
}

export async function resolveDispute(disputeId: string, adminId: string, vendorPercent: number, resolution: string) {
  const d = await db.query.disputes.findFirst({ where: eq(schema.disputes.id, disputeId), with: { booking: true } });
  if (!d) throw new Error("Dispute not found");
  if (d.status !== "OPEN") throw new Error("Dispute already resolved.");
  await releaseMilestone(d.milestoneId, adminId, `Dispute resolved (${vendorPercent}% to vendor): ${resolution}`, vendorPercent);
  await db
    .update(schema.disputes)
    .set({ status: "RESOLVED", vendorPercent, resolution, resolvedAt: new Date() })
    .where(eq(schema.disputes.id, d.id));
  if (vendorPercent < 50)
    await db
      .update(schema.vendors)
      .set({ disputesLost: sql`${schema.vendors.disputesLost} + 1` })
      .where(eq(schema.vendors.id, d.booking.vendorId));
  const b = await db.query.bookings.findFirst({ where: eq(B.id, d.bookingId) });
  const open = await db.select({ id: schema.disputes.id }).from(schema.disputes).where(and(eq(schema.disputes.bookingId, d.bookingId), eq(schema.disputes.status, "OPEN")));
  if (b && open.length === 0 && b.status === "DISPUTED")
    await db.update(B).set({ status: b.deliveredAt ? "DELIVERED" : "IN_PROGRESS" }).where(eq(B.id, b.id));
}

/** Net balance of each ledger account (credits minus debits). */
export async function ledgerBalances() {
  const rows = await db.select().from(L);
  const bal: Record<string, number> = { CLIENT: 0, ESCROW: 0, VENDOR: 0, PLATFORM: 0 };
  for (const r of rows) {
    bal[r.credit] += r.amount;
    bal[r.debit] -= r.amount;
  }
  return bal;
}

export const heldStatuses = ["FUNDED", "RELEASE_REQUESTED", "DISPUTED"] as const;
export { inArray };
