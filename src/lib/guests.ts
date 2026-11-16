import "server-only";
import crypto from "crypto";
import QRCode from "qrcode";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { Guest, SeatTable } from "@/db/schema";
import { db, schema } from "./db";

export const newGuestToken = () => crypto.randomBytes(12).toString("base64url");

/** QR payload format: "EVTA:<token>". The gate app hashes the token to match offline. */
export const qrPayload = (token: string) => `EVTA:${token}`;

export const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export const qrDataUrl = (token: string) =>
  QRCode.toDataURL(qrPayload(token), { margin: 1, width: 320, errorCorrectionLevel: "M" });

const CATEGORY_RANK = { VIP: 0, FAMILY: 1, GENERAL: 2, CREW: 3 } as const;
const ZONE_FOR = { VIP: ["High table", "VIP"], FAMILY: ["Family", "VIP"], GENERAL: ["General", "Family"], CREW: ["Crew"] } as const;

/**
 * Auto-seat confirmed/pending guests (not declined) into tables.
 * Keeps each seat-together group intact where possible, fills preferred zones first,
 * and never exceeds table capacity. Already-seated guests are kept unless reset=true.
 */
export async function autoSeat(eventId: string, reset = false) {
  const G = schema.guests;
  if (reset) await db.update(G).set({ tableId: null }).where(eq(G.eventId, eventId));
  const tables = await db.query.seatTables.findMany({
    where: eq(schema.seatTables.eventId, eventId),
    orderBy: asc(schema.seatTables.sort),
    with: { guests: true },
  });
  const guests = await db
    .select()
    .from(G)
    .where(and(eq(G.eventId, eventId), isNull(G.tableId), ne(G.rsvp, "NO"), eq(G.revoked, false)));

  const free = new Map<string, number>(tables.map((t) => [t.id, t.capacity - t.guests.length]));

  // Build groups: named group or a single guest.
  const groups = new Map<string, Guest[]>();
  for (const g of guests) {
    const key = g.group.trim() ? `${g.category}:${g.group.trim().toLowerCase()}` : `solo:${g.id}`;
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  const ordered = [...groups.values()].sort(
    (a, b) => CATEGORY_RANK[a[0].category] - CATEGORY_RANK[b[0].category] || b.length - a.length,
  );

  const zoneOrder = (t: SeatTable, cat: Guest["category"]) => {
    const pref = ZONE_FOR[cat] as readonly string[];
    const idx = pref.findIndex((z) => t.zone.toLowerCase() === z.toLowerCase());
    return idx === -1 ? pref.length : idx;
  };

  const updates: { id: string; tableId: string }[] = [];
  let unseated = 0;
  for (const group of ordered) {
    const cat = group[0].category;
    const candidates = [...tables].sort((a, b) => zoneOrder(a, cat) - zoneOrder(b, cat) || a.sort - b.sort);
    // Prefer one table that fits the whole group.
    const whole = candidates.find((t) => (free.get(t.id) ?? 0) >= group.length);
    if (whole) {
      group.forEach((g) => updates.push({ id: g.id, tableId: whole.id }));
      free.set(whole.id, free.get(whole.id)! - group.length);
      continue;
    }
    // Otherwise split across the fewest preferred tables.
    for (const g of group) {
      const t = candidates.find((c) => (free.get(c.id) ?? 0) > 0);
      if (!t) {
        unseated++;
        continue;
      }
      updates.push({ id: g.id, tableId: t.id });
      free.set(t.id, free.get(t.id)! - 1);
    }
  }
  await db.transaction(async (tx) => {
    for (const u of updates) await tx.update(G).set({ tableId: u.tableId }).where(eq(G.id, u.id));
  });
  return { seated: updates.length, unseated };
}

/** Parse "name, phone, side, group, category" lines pasted by the host. */
export function parseGuestLines(text: string) {
  const cats = ["VIP", "FAMILY", "GENERAL", "CREW"];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^name\s*,/i.test(l))
    .map((l) => {
      const [name, phone = "", side = "Both", group = "", category = "GENERAL"] = l.split(",").map((s) => s.trim());
      const cat = category.toUpperCase();
      return {
        name,
        phone: phone || null,
        side: side || "Both",
        group,
        category: (cats.includes(cat) ? cat : "GENERAL") as Guest["category"],
      };
    })
    .filter((g) => g.name);
}
