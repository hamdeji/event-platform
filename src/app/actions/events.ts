"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireEvent, requireUser } from "@/lib/auth";
import { generatePlan, recomputePlanTotal, savePlan, switchTier } from "@/lib/ai/planner";
import { askAssistant } from "@/lib/ai/assistant";
import { getPack } from "@/lib/packs";
import { errMsg, fail, int, isRedirect, str } from "./util";

export async function createEvent(fd: FormData) {
  const user = await requireUser(["CLIENT", "ADMIN"]);
  const pack = getPack(str(fd, "pack") || "wedding");
  const ceremonies = pack.ceremonies.map((c) => c.key).filter((k) => fd.get(`c_${k}`));
  // Store event dates at midday Lagos time so they never shift a day across time zones.
  const dateStr = str(fd, "date");
  const date = new Date(`${dateStr}T12:00:00+01:00`);
  const todayLagos = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const guestCount = int(fd, "guestCount");
  const hostNames = str(fd, "hostNames");
  if (!hostNames) fail("/events/new", "Tell us whose event this is.");
  if (isNaN(date.getTime()) || dateStr < todayLagos) fail("/events/new", "Choose a future date.");
  if (!guestCount || guestCount < 10) fail("/events/new", "Enter the expected number of guests.");
  if (!ceremonies.length) fail("/events/new", "Pick at least one ceremony.");

  const [event] = await db
    .insert(schema.events)
    .values({
      ownerId: user.id,
      pack: pack.key,
      title: str(fd, "title") || `${hostNames} ${pack.name}`,
      hostNames,
      date,
      city: str(fd, "city") || "Lagos",
      venueName: str(fd, "venueName") || null,
      guestCount,
      culture: str(fd, "culture") || "Mixed",
      ceremonies: ceremonies.join(","),
      style: str(fd, "style"),
      budget: int(fd, "budget"),
      mustHaves: str(fd, "mustHaves"),
      notes: str(fd, "notes"),
    })
    .returning();

  const plan = await generatePlan(event);
  await savePlan(event.id, plan);
  redirect(`/events/${event.id}/plan`);
}

export async function regeneratePlan(eventId: string) {
  const { event } = await requireEvent(eventId);
  await savePlan(event.id, await generatePlan(event));
  revalidatePath(`/events/${eventId}/plan`);
}

export async function chooseTier(eventId: string, tier: string) {
  await requireEvent(eventId);
  await switchTier(eventId, tier);
  revalidatePath(`/events/${eventId}/plan`);
}

async function ownedItem(itemId: string) {
  const item = await db.query.planItems.findFirst({ where: eq(schema.planItems.id, itemId), with: { plan: true } });
  if (!item) throw new Error("Item not found");
  await requireEvent(item.plan.eventId);
  return item;
}

export async function updateItem(itemId: string, fd: FormData) {
  const item = await ownedItem(itemId);
  const amount = int(fd, "amount");
  await db
    .update(schema.planItems)
    .set({ amount: amount ?? item.amount, description: str(fd, "description") || item.description })
    .where(eq(schema.planItems.id, itemId));
  await recomputePlanTotal(item.planId);
  revalidatePath(`/events/${item.plan.eventId}/plan`);
}

export async function toggleLock(itemId: string) {
  const item = await ownedItem(itemId);
  await db.update(schema.planItems).set({ locked: !item.locked }).where(eq(schema.planItems.id, itemId));
  revalidatePath(`/events/${item.plan.eventId}/plan`);
}

export async function deleteItem(itemId: string) {
  const item = await ownedItem(itemId);
  await db.delete(schema.planItems).where(eq(schema.planItems.id, itemId));
  await recomputePlanTotal(item.planId);
  revalidatePath(`/events/${item.plan.eventId}/plan`);
}

export async function addItem(eventId: string, fd: FormData) {
  await requireEvent(eventId);
  const plan = await db.query.plans.findFirst({ where: eq(schema.plans.eventId, eventId) });
  if (!plan) fail(`/events/${eventId}/plan`, "Generate a plan first.");
  await db.insert(schema.planItems).values({
    planId: plan.id,
    category: str(fd, "category") || "OTHER",
    description: str(fd, "description") || "New item",
    amount: int(fd, "amount") ?? 0,
    sort: 999,
  });
  await recomputePlanTotal(plan.id);
  revalidatePath(`/events/${eventId}/plan`);
}

export async function setContingency(eventId: string, fd: FormData) {
  await requireEvent(eventId);
  const plan = await db.query.plans.findFirst({ where: eq(schema.plans.eventId, eventId) });
  if (!plan) return;
  const pct = Math.min(30, Math.max(0, int(fd, "pct") ?? plan.contingencyPct));
  await db.update(schema.plans).set({ contingencyPct: pct }).where(eq(schema.plans.id, plan.id));
  await recomputePlanTotal(plan.id);
  revalidatePath(`/events/${eventId}/plan`);
}

export async function ask(eventId: string, fd: FormData) {
  await requireEvent(eventId);
  const q = str(fd, "question");
  if (!q) return;
  try {
    await askAssistant(eventId, q);
  } catch (e) {
    if (isRedirect(e)) throw e;
    fail(`/events/${eventId}/plan#assistant`, "Assistant error: " + errMsg(e));
  }
  redirect(`/events/${eventId}/plan#assistant`);
}

export async function applyProposal(eventId: string, messageId: string) {
  await requireEvent(eventId);
  const msg = await db.query.assistantMessages.findFirst({
    where: and(eq(schema.assistantMessages.id, messageId), eq(schema.assistantMessages.eventId, eventId)),
  });
  const plan = await db.query.plans.findFirst({ where: eq(schema.plans.eventId, eventId), with: { items: true } });
  if (!msg?.proposal || msg.applied || !plan) return;
  const ids = new Set(plan.items.filter((i) => !i.locked).map((i) => i.id));
  await db.transaction(async (tx) => {
    for (const c of msg.proposal!.changes)
      if (ids.has(c.itemId)) await tx.update(schema.planItems).set({ amount: Math.round(c.newAmount) }).where(eq(schema.planItems.id, c.itemId));
    await tx.update(schema.assistantMessages).set({ applied: true }).where(eq(schema.assistantMessages.id, messageId));
  });
  await recomputePlanTotal(plan.id);
  revalidatePath(`/events/${eventId}/plan`);
}

export async function updateEventDetails(eventId: string, fd: FormData) {
  await requireEvent(eventId);
  await db
    .update(schema.events)
    .set({
      guestCount: int(fd, "guestCount") ?? undefined,
      budget: int(fd, "budget"),
      venueName: str(fd, "venueName") || null,
      style: str(fd, "style"),
      mustHaves: str(fd, "mustHaves"),
    })
    .where(eq(schema.events.id, eventId));
  revalidatePath(`/events/${eventId}/plan`);
}
