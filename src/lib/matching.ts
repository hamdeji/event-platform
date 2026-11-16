import "server-only";
import { and, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import type { Event, Vendor } from "@/db/schema";
import { db, schema } from "./db";

export type Match = { vendor: Vendor; score: number; reasons: string[]; available: boolean };

const tierScore = { LISTED: 0, VERIFIED: 12, PRO: 20 } as const;

/**
 * Rank vendors in a category for an event. Transparent, rules-based scoring so clients
 * and vendors can see why a vendor ranks where it does.
 *   price fit 0-35 · rating 0-25 · verification 0-20 · style 0-10 · track record 0-10
 * Vendors already booked on the event date are flagged unavailable and pushed down.
 */
export async function matchVendors(event: Event, category: string, budgetLine?: number, limit = 6): Promise<Match[]> {
  const v = schema.vendors;
  const vendors = await db
    .select()
    .from(v)
    .where(
      and(
        eq(v.category, category),
        inArray(v.tier, ["VERIFIED", "PRO"]),
        or(sql`lower(${v.city}) = lower(${event.city})`, sql`${v.serviceAreas} ilike ${"%" + event.city + "%"}`),
      ),
    );

  const dayStart = new Date(event.date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const b = schema.bookings;
  const busy = vendors.length
    ? await db
        .select({ vendorId: b.vendorId })
        .from(b)
        .innerJoin(schema.events, eq(schema.events.id, b.eventId))
        .where(
          and(
            inArray(b.vendorId, vendors.map((x) => x.id)),
            inArray(b.status, ["CONTRACT_SIGNED", "IN_PROGRESS", "ACCEPTED"]),
            gte(schema.events.date, dayStart),
            lt(schema.events.date, dayEnd),
            ne(b.eventId, event.id),
          ),
        )
    : [];
  const busyIds = new Set(busy.map((b) => b.vendorId));
  const styles = event.style.toLowerCase();

  const scored = vendors.map((v) => {
    const reasons: string[] = [];
    let score = 0;
    const estCost = v.priceUnit.includes("guest") || v.priceUnit.includes("plate") ? v.priceFrom * event.guestCount : v.priceFrom;
    if (budgetLine) {
      const ratio = estCost / budgetLine;
      if (ratio <= 1) {
        score += 35 - Math.max(0, (0.6 - ratio) * 20);
        reasons.push("Within budget");
      } else if (ratio <= 1.2) {
        score += 18;
        reasons.push("Slightly above budget");
      } else reasons.push("Above budget");
    } else score += 20;
    score += (v.rating / 5) * 25;
    score += tierScore[v.tier];
    if (v.tier === "PRO") reasons.push("Verified Pro");
    if (styles && v.styles.toLowerCase().split(",").some((s) => s.trim() && styles.includes(s.trim()))) {
      score += 10;
      reasons.push("Style match");
    }
    score += Math.min(10, v.completedBookings / 3);
    const available = !busyIds.has(v.id);
    if (!available) score -= 50;
    return { vendor: v, score: Math.round(score), reasons, available };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function estimateVendorCost(v: Pick<Vendor, "priceFrom" | "priceUnit">, guests: number) {
  return v.priceUnit.includes("guest") || v.priceUnit.includes("plate") ? v.priceFrom * guests : v.priceFrom;
}
