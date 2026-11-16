import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { qrDataUrl } from "@/lib/guests";
import { fmtDate } from "@/lib/format";
import { guestRsvp } from "@/app/actions/guests";
import { SubmitButton } from "@/components/SubmitButton";
import { AccessCard } from "@/components/AccessCard";

export const metadata = { title: "Your access card", robots: { index: false } };

export default async function CardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await db.query.guests.findFirst({ where: eq(schema.guests.token, token), with: { event: true, table: true } });
  if (!g || g.revoked) notFound();
  const qr = await qrDataUrl(g.token);
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <AccessCard guest={g} event={g.event} table={g.table} qr={qr} />
      <form action={guestRsvp.bind(null, token)} className="card no-print space-y-3">
        <div className="font-semibold">{g.rsvp === "PENDING" ? "Will you attend?" : g.rsvp === "YES" ? "You're coming 🎉 (you can change this)" : "You declined (you can change this)"}</div>
        <div className="text-sm text-stone-600">{g.event.hostNames} · {fmtDate(g.event.date)} · {g.event.city}</div>
        <input className="input" name="meal" defaultValue={g.mealChoice ?? ""} placeholder="Meal preference or dietary needs (optional)" />
        <div className="flex gap-2">
          <button name="rsvp" value="YES" className="btn-primary flex-1">Yes, I&apos;ll be there</button>
          <button name="rsvp" value="NO" className="btn-outline flex-1">Can&apos;t make it</button>
        </div>
      </form>
      <p className="no-print text-center text-xs text-stone-500">Show this QR code at the gate. It admits one person and works once.</p>
    </div>
  );
}
