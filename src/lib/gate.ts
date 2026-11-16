import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { getSession } from "./auth";

/** Owner, admin and gate staff can operate the gate for an event. */
export async function gateAccess(eventId: string) {
  const s = await getSession();
  if (!s) return null;
  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event) return null;
  if (event.ownerId === s.userId || s.role === "ADMIN" || s.role === "GATE") return { session: s, event };
  return null;
}
