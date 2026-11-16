import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { gateAccess } from "@/lib/gate";
import { tokenHash } from "@/lib/guests";

/**
 * Guest manifest for offline scanning. Contains SHA-256 hashes of card tokens, never the tokens,
 * so a lost gate phone cannot be used to mint valid cards.
 */
export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const a = await gateAccess(eventId);
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const guests = await db.query.guests.findMany({ where: eq(schema.guests.eventId, eventId), with: { table: true } });
  return NextResponse.json({
    event: { id: a.event.id, title: a.event.title, hostNames: a.event.hostNames },
    syncedAt: new Date().toISOString(),
    guests: guests.map((g) => ({
      h: tokenHash(g.token),
      id: g.id,
      name: g.name,
      category: g.category,
      table: g.table?.name ?? null,
      rsvp: g.rsvp,
      revoked: g.revoked,
      checkedInAt: g.checkedInAt,
    })),
  });
}
