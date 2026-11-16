import { and, asc, eq, ne } from "drizzle-orm";
import { requireEvent } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { qrDataUrl } from "@/lib/guests";
import { AccessCard } from "@/components/AccessCard";
import { PrintButton } from "@/app/contracts/[id]/PrintButton";

export const metadata = { title: "Print access cards" };

export default async function Cards({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await requireEvent(id);
  const guests = await db.query.guests.findMany({
    where: and(eq(schema.guests.eventId, id), ne(schema.guests.rsvp, "NO"), eq(schema.guests.revoked, false)),
    with: { table: true },
    orderBy: asc(schema.guests.name),
  });
  const qrs = await Promise.all(guests.map((g) => qrDataUrl(g.token)));
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <h1 className="h1">{guests.length} access cards</h1>
        <PrintButton />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
        {guests.map((g, i) => <AccessCard key={g.id} guest={g} event={event} table={g.table} qr={qrs[i]} />)}
      </div>
    </div>
  );
}
