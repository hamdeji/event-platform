import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { gateAccess } from "@/lib/gate";

/** Sync check-ins recorded on a gate device (online or after reconnecting). First scan wins. */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const a = await gateAccess(eventId);
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json()) as { checkins: { id: string; at: string }[] };
  const results: { id: string; status: "ok" | "duplicate" | "invalid"; at?: string }[] = [];
  for (const c of body.checkins ?? []) {
    const [updated] = await db
      .update(schema.guests)
      .set({ checkedInAt: new Date(c.at), checkedInBy: a.session.name })
      .where(and(eq(schema.guests.id, c.id), eq(schema.guests.eventId, eventId), isNull(schema.guests.checkedInAt), eq(schema.guests.revoked, false)))
      .returning();
    if (updated) results.push({ id: c.id, status: "ok" });
    else {
      const g = await db.query.guests.findFirst({ where: and(eq(schema.guests.id, c.id), eq(schema.guests.eventId, eventId)) });
      results.push(g ? { id: c.id, status: "duplicate", at: g.checkedInAt?.toISOString() } : { id: c.id, status: "invalid" });
    }
  }
  return NextResponse.json({ results });
}
