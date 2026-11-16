"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ECON, MILESTONES } from "@/lib/config";
import { buildContractBody, newOtp, sendOtp, sha256 } from "@/lib/contracts";
import { markDelivered, openDispute, releaseMilestone, startMilestonePayment } from "@/lib/escrow";
import { errMsg, fail, int, isRedirect, ok, str } from "./util";

const B = schema.bookings;

/** Load a booking and check the current user is the client, the vendor or an admin. */
async function access(bookingId: string) {
  const user = await requireUser();
  const booking = await db.query.bookings.findFirst({
    where: eq(B.id, bookingId),
    with: { vendor: { with: { user: true } }, client: true, event: true, contract: true, milestones: true },
  });
  if (!booking) redirect("/dashboard");
  const isClient = booking.clientId === user.id;
  const isVendor = booking.vendor.userId === user.id;
  const isAdmin = user.role === "ADMIN";
  if (!isClient && !isVendor && !isAdmin) redirect("/dashboard");
  return { user, booking, isClient, isVendor, isAdmin };
}

const back = (id: string) => `/bookings/${id}`;

async function guarded(id: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (isRedirect(e)) throw e;
    fail(back(id), errMsg(e));
  }
  revalidatePath(back(id));
}

// ---------- Quote requests ----------

export async function requestQuote(vendorId: string, fd: FormData) {
  const user = await requireUser(["CLIENT", "ADMIN"]);
  const eventId = str(fd, "eventId");
  const event = await db.query.events.findFirst({ where: and(eq(schema.events.id, eventId), eq(schema.events.ownerId, user.id)) });
  const vendor = await db.query.vendors.findFirst({ where: eq(schema.vendors.id, vendorId) });
  if (!vendor) redirect("/vendors");
  if (!event) fail(`/vendors/${vendor.slug}`, "Choose one of your events.");
  if (vendor.tier === "LISTED") fail(`/vendors/${vendor.slug}`, "This vendor is not yet verified for escrow bookings.");
  const existing = await db.query.bookings.findFirst({
    where: and(eq(B.eventId, eventId), eq(B.vendorId, vendorId), sql`${B.status} not in ('DECLINED','CANCELLED')`),
  });
  if (existing) redirect(back(existing.id));
  const brief = str(fd, "brief") || `Quote request for ${event.title}`;
  const [booking] = await db
    .insert(B)
    .values({
      eventId,
      vendorId,
      clientId: user.id,
      category: vendor.category,
      brief,
      commissionPct: vendor.tier === "PRO" ? ECON.proCommissionPct : ECON.commissionPct,
    })
    .returning();
  await db.insert(schema.messages).values({ bookingId: booking.id, senderId: user.id, body: brief });
  redirect(back(booking.id));
}

export async function sendQuote(bookingId: string, fd: FormData) {
  const { booking, isVendor } = await access(bookingId);
  if (!isVendor) fail(back(bookingId), "Only the vendor can send a quote.");
  if (!["REQUESTED", "QUOTED"].includes(booking.status)) fail(back(bookingId), "The quote can no longer be changed.");
  const amount = int(fd, "amount");
  const details = str(fd, "details");
  if (!amount || amount < 1000) fail(back(bookingId), "Enter the quote amount.");
  if (!details) fail(back(bookingId), "List the deliverables, one per line.");
  await guarded(bookingId, async () => {
    await db.update(B).set({ status: "QUOTED", quoteAmount: amount, quoteDetails: details }).where(eq(B.id, bookingId));
    await db.insert(schema.messages).values({
      bookingId,
      senderId: booking.vendor.userId,
      system: true,
      body: `📝 Quote sent: ₦${amount.toLocaleString()}\n${details}`,
    });
  });
}

export async function declineBooking(bookingId: string) {
  const { user, booking, isVendor, isClient } = await access(bookingId);
  if (!["REQUESTED", "QUOTED"].includes(booking.status)) fail(back(bookingId), "This booking can no longer be declined here.");
  await guarded(bookingId, async () => {
    await db.update(B).set({ status: isVendor ? "DECLINED" : "CANCELLED" }).where(eq(B.id, bookingId));
    await db.insert(schema.messages).values({ bookingId, senderId: user.id, system: true, body: isClient ? "Client withdrew the request." : "Vendor declined the request." });
  });
}

/** Client accepts the quote: generates the contract and the escrow milestones. */
export async function acceptQuote(bookingId: string) {
  const { booking, isClient } = await access(bookingId);
  if (!isClient) fail(back(bookingId), "Only the client can accept a quote.");
  if (booking.status !== "QUOTED" || !booking.quoteAmount) fail(back(bookingId), "There is no quote to accept.");
  await guarded(bookingId, async () => {
    await db.update(B).set({ status: "ACCEPTED" }).where(eq(B.id, bookingId));
    const body = await buildContractBody(bookingId);
    const amount = booking.quoteAmount!;
    let allocated = 0;
    await db.transaction(async (tx) => {
      await tx.delete(schema.contracts).where(eq(schema.contracts.bookingId, bookingId));
      await tx.insert(schema.contracts).values({ bookingId, body, bodyHash: sha256(body) });
      await tx.delete(schema.milestones).where(eq(schema.milestones.bookingId, bookingId));
      await tx.insert(schema.milestones).values(
        MILESTONES.map((m, i) => {
          const amt = i === MILESTONES.length - 1 ? amount - allocated : Math.round((amount * m.percent) / 100);
          allocated += amt;
          return { bookingId, label: m.label, percent: m.percent, amount: amt, sort: i, earlyRelease: m.earlyRelease };
        }),
      );
      await tx.insert(schema.messages).values({ bookingId, senderId: booking.clientId, system: true, body: "🤝 Quote accepted. The contract is ready for both parties to sign." });
    });
  });
}

// ---------- Contract signing ----------

export async function requestSignOtp(bookingId: string) {
  const { user, booking, isClient, isVendor } = await access(bookingId);
  if (!booking.contract) fail(back(bookingId), "No contract yet.");
  if (!isClient && !isVendor) fail(back(bookingId), "Only the parties can sign.");
  const code = newOtp();
  await db
    .update(schema.contracts)
    .set(isClient ? { clientOtpHash: sha256(code + booking.contract.id) } : { vendorOtpHash: sha256(code + booking.contract.id) })
    .where(eq(schema.contracts.id, booking.contract.id));
  const shown = await sendOtp({ phone: user.phone, email: user.email }, code);
  ok(back(bookingId) + "#contract", shown ? `Signing code sent. (Development mode: your code is ${shown})` : "Signing code sent to your phone.");
}

export async function signContract(bookingId: string, fd: FormData) {
  const { booking, isClient, isVendor } = await access(bookingId);
  const c = booking.contract;
  if (!c) fail(back(bookingId), "No contract yet.");
  const code = str(fd, "otp");
  const expected = isClient ? c.clientOtpHash : isVendor ? c.vendorOtpHash : null;
  if (!expected || sha256(code + c.id) !== expected) fail(back(bookingId) + "#contract", "That code is not valid. Request a new one.");
  // Make sure nobody changed the contract text since it was generated.
  if (sha256(c.body) !== c.bodyHash) fail(back(bookingId), "Contract integrity check failed. Please regenerate the contract.");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const now = new Date();
  await guarded(bookingId, async () => {
    await db
      .update(schema.contracts)
      .set(isClient ? { clientSignedAt: now, clientSignIp: ip, clientOtpHash: null } : { vendorSignedAt: now, vendorSignIp: ip, vendorOtpHash: null })
      .where(eq(schema.contracts.id, c.id));
    const fresh = await db.query.contracts.findFirst({ where: eq(schema.contracts.id, c.id) });
    const party = isClient ? "Client" : "Vendor";
    await db.insert(schema.messages).values({ bookingId, senderId: isClient ? booking.clientId : booking.vendor.userId, system: true, body: `✍️ ${party} signed the contract.` });
    if (fresh?.clientSignedAt && fresh.vendorSignedAt) {
      await db.update(B).set({ status: "CONTRACT_SIGNED" }).where(eq(B.id, bookingId));
      await db.insert(schema.messages).values({ bookingId, senderId: booking.clientId, system: true, body: "📄 Contract fully signed. The client can now fund the commitment deposit." });
    }
  });
}

// ---------- Messaging ----------

export async function sendMessage(bookingId: string, fd: FormData) {
  const { user } = await access(bookingId);
  const body = str(fd, "body");
  if (!body) return;
  await db.insert(schema.messages).values({ bookingId, senderId: user.id, body: body.slice(0, 4000) });
  revalidatePath(back(bookingId));
}

export async function togglePin(bookingId: string, messageId: string) {
  const { booking } = await access(bookingId);
  if (booking.contract?.clientSignedAt || booking.contract?.vendorSignedAt) fail(back(bookingId), "The contract is already signed. Agree changes as a new booking or amendment.");
  const m = await db.query.messages.findFirst({ where: and(eq(schema.messages.id, messageId), eq(schema.messages.bookingId, bookingId)) });
  if (!m || m.system) return;
  await db.update(schema.messages).set({ pinned: !m.pinned }).where(eq(schema.messages.id, messageId));
  // Refresh an unsigned contract so pinned terms appear in it.
  if (booking.contract) {
    const body = await buildContractBody(bookingId);
    await db.update(schema.contracts).set({ body, bodyHash: sha256(body), version: booking.contract.version + 1 }).where(eq(schema.contracts.id, booking.contract.id));
  }
  revalidatePath(back(bookingId));
}

// ---------- Escrow ----------

export async function payMilestone(bookingId: string, milestoneId: string) {
  const { user, booking, isClient } = await access(bookingId);
  if (!isClient) fail(back(bookingId), "Only the client pays milestones.");
  if (!booking.milestones.some((m) => m.id === milestoneId)) fail(back(bookingId), "Unknown milestone.");
  let url = "";
  try {
    url = await startMilestonePayment(milestoneId, user.email);
  } catch (e) {
    fail(back(bookingId), errMsg(e));
  }
  redirect(url);
}

export async function clientRelease(bookingId: string, milestoneId: string) {
  const { user, booking, isClient, isAdmin } = await access(bookingId);
  if (!isClient && !isAdmin) fail(back(bookingId), "Only the client can release funds.");
  const m = booking.milestones.find((x) => x.id === milestoneId);
  if (!m) fail(back(bookingId), "Unknown milestone.");
  const delivered = booking.status === "DELIVERED" || booking.status === "COMPLETED";
  if (!m.earlyRelease && !delivered && !isAdmin) fail(back(bookingId), "This payment can be released once the vendor marks the service delivered.");
  await guarded(bookingId, () => releaseMilestone(milestoneId, user.id, delivered ? "Client confirmed delivery" : "Client released the deposit early"));
}

export async function vendorDelivered(bookingId: string) {
  const { user, booking, isVendor } = await access(bookingId);
  if (!isVendor) fail(back(bookingId), "Only the vendor can mark delivery.");
  if (!["IN_PROGRESS", "CONTRACT_SIGNED"].includes(booking.status)) fail(back(bookingId), "Nothing to deliver yet.");
  if (booking.event.date.getTime() > Date.now() + 86_400_000) fail(back(bookingId), "You can mark delivery from the day of the event.");
  await guarded(bookingId, () => markDelivered(bookingId, user.id));
}

export async function dispute(bookingId: string, milestoneId: string, fd: FormData) {
  const { user } = await access(bookingId);
  const reason = str(fd, "reason");
  if (reason.length < 10) fail(back(bookingId), "Describe the problem (at least 10 characters).");
  await guarded(bookingId, () => openDispute(milestoneId, user.id, reason));
}

// ---------- Reviews ----------

export async function leaveReview(bookingId: string, fd: FormData) {
  const { user, booking, isClient } = await access(bookingId);
  if (!isClient) fail(back(bookingId), "Only the client can review.");
  if (booking.status !== "COMPLETED") fail(back(bookingId), "You can review once the booking is completed through escrow.");
  const score = (k: string) => Math.min(5, Math.max(1, int(fd, k) ?? 5));
  const r = { punctuality: score("punctuality"), quality: score("quality"), communication: score("communication"), value: score("value") };
  await guarded(bookingId, async () => {
    await db.insert(schema.reviews).values({ bookingId, vendorId: booking.vendorId, clientId: user.id, ...r, comment: str(fd, "comment") });
    const [agg] = await db
      .select({
        avg: sql<number>`avg((${schema.reviews.punctuality} + ${schema.reviews.quality} + ${schema.reviews.communication} + ${schema.reviews.value}) / 4.0)::float`,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.reviews)
      .where(eq(schema.reviews.vendorId, booking.vendorId));
    await db.update(schema.vendors).set({ rating: Math.round(agg.avg * 10) / 10, reviewCount: agg.n }).where(eq(schema.vendors.id, booking.vendorId));
  });
}

export async function replyToReview(bookingId: string, fd: FormData) {
  const { isVendor } = await access(bookingId);
  if (!isVendor) return;
  await db.update(schema.reviews).set({ vendorReply: str(fd, "reply") }).where(and(eq(schema.reviews.bookingId, bookingId), sql`${schema.reviews.vendorReply} is null`));
  revalidatePath(back(bookingId));
}
