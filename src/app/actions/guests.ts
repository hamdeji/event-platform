"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireEvent } from "@/lib/auth";
import { autoSeat, newGuestToken, parseGuestLines } from "@/lib/guests";
import type { GuestCategory } from "@/db/schema";
import { fail, int, ok, str } from "./util";

const G = schema.guests;
const T = schema.seatTables;
const guestsPath = (id: string) => `/events/${id}/guests`;
const seatingPath = (id: string) => `/events/${id}/seating`;

const CATS = ["VIP", "FAMILY", "GENERAL", "CREW"];

export async function addGuest(eventId: string, fd: FormData) {
  await requireEvent(eventId);
  const name = str(fd, "name");
  if (!name) fail(guestsPath(eventId), "Guest name is required.");
  const cat = str(fd, "category");
  await db.insert(G).values({
    eventId,
    name,
    phone: str(fd, "phone") || null,
    side: str(fd, "side") || "Both",
    group: str(fd, "group"),
    category: (CATS.includes(cat) ? cat : "GENERAL") as GuestCategory,
    token: newGuestToken(),
  });
  revalidatePath(guestsPath(eventId));
}

export async function importGuests(eventId: string, fd: FormData) {
  await requireEvent(eventId);
  const rows = parseGuestLines(str(fd, "lines"));
  if (!rows.length) fail(guestsPath(eventId), "No guests found. Use one guest per line: name, phone, side, group, category");
  await db.insert(G).values(rows.map((r) => ({ ...r, eventId, token: newGuestToken() })));
  ok(guestsPath(eventId), `${rows.length} guests imported.`);
}

async function ownGuest(eventId: string, guestId: string) {
  await requireEvent(eventId);
  const g = await db.query.guests.findFirst({ where: and(eq(G.id, guestId), eq(G.eventId, eventId)) });
  if (!g) fail(guestsPath(eventId), "Guest not found.");
  return g;
}

export async function deleteGuest(eventId: string, guestId: string) {
  await ownGuest(eventId, guestId);
  await db.delete(G).where(eq(G.id, guestId));
  revalidatePath(guestsPath(eventId));
}

export async function setRsvpByHost(eventId: string, guestId: string, rsvp: "YES" | "NO" | "PENDING") {
  await ownGuest(eventId, guestId);
  await db.update(G).set({ rsvp }).where(eq(G.id, guestId));
  revalidatePath(guestsPath(eventId));
}

/** Revoke the old card and issue a new QR code (lost or forwarded card). */
export async function reissueCard(eventId: string, guestId: string) {
  await ownGuest(eventId, guestId);
  await db.update(G).set({ token: newGuestToken(), revoked: false, checkedInAt: null }).where(eq(G.id, guestId));
  ok(guestsPath(eventId), "New access card issued. The old QR code no longer works.");
}

export async function toggleRevoke(eventId: string, guestId: string) {
  const g = await ownGuest(eventId, guestId);
  await db.update(G).set({ revoked: !g.revoked }).where(eq(G.id, guestId));
  revalidatePath(guestsPath(eventId));
}

/** Public RSVP from the guest's card link. */
export async function guestRsvp(token: string, fd: FormData) {
  const rsvp = str(fd, "rsvp") === "NO" ? "NO" : "YES";
  await db.update(G).set({ rsvp, mealChoice: str(fd, "meal") || null }).where(eq(G.token, token));
  revalidatePath(`/card/${token}`);
}

// ---------- Seating ----------

export async function addTables(eventId: string, fd: FormData) {
  await requireEvent(eventId);
  const count = Math.min(200, Math.max(1, int(fd, "count") ?? 1));
  const capacity = Math.min(50, Math.max(1, int(fd, "capacity") ?? 10));
  const zone = str(fd, "zone") || "General";
  const prefix = str(fd, "prefix") || "Table";
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(T).where(eq(T.eventId, eventId));
  await db.insert(T).values(
    Array.from({ length: count }, (_, i) => ({ eventId, name: `${prefix} ${n + i + 1}`, capacity, zone, sort: n + i })),
  );
  revalidatePath(seatingPath(eventId));
}

export async function deleteTable(eventId: string, tableId: string) {
  await requireEvent(eventId);
  await db.delete(T).where(and(eq(T.id, tableId), eq(T.eventId, eventId)));
  revalidatePath(seatingPath(eventId));
}

export async function renameTable(eventId: string, tableId: string, fd: FormData) {
  await requireEvent(eventId);
  await db
    .update(T)
    .set({ name: str(fd, "name"), capacity: int(fd, "capacity") ?? undefined, zone: str(fd, "zone") || undefined })
    .where(and(eq(T.id, tableId), eq(T.eventId, eventId)));
  revalidatePath(seatingPath(eventId));
}

export async function assignTable(eventId: string, guestId: string, fd: FormData) {
  await ownGuest(eventId, guestId);
  const tableId = str(fd, "tableId") || null;
  if (tableId) {
    const t = await db.query.seatTables.findFirst({ where: and(eq(T.id, tableId), eq(T.eventId, eventId)), with: { guests: { columns: { id: true } } } });
    if (!t) fail(seatingPath(eventId), "Table not found.");
    if (t.guests.filter((g) => g.id !== guestId).length >= t.capacity) fail(seatingPath(eventId), `${t.name} is full.`);
  }
  await db.update(G).set({ tableId }).where(eq(G.id, guestId));
  revalidatePath(seatingPath(eventId));
}

export async function runAutoSeat(eventId: string, fd: FormData) {
  await requireEvent(eventId);
  const r = await autoSeat(eventId, str(fd, "reset") === "1");
  ok(seatingPath(eventId), `Seated ${r.seated} guests.${r.unseated ? ` ${r.unseated} could not be seated: add more tables.` : ""}`);
}
