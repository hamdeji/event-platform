import { asc, eq } from "drizzle-orm";
import { requireEvent } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { Flash, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { EventHeader } from "../EventHeader";
import { addTables, assignTable, deleteTable, renameTable, runAutoSeat } from "@/app/actions/guests";

export const metadata = { title: "Seating" };

const ZONES = ["High table", "VIP", "Family", "General", "Crew"];

export default async function Seating({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { event } = await requireEvent(id);
  const [tables, guests] = await Promise.all([
    db.query.seatTables.findMany({ where: eq(schema.seatTables.eventId, id), orderBy: asc(schema.seatTables.sort), with: { guests: true } }),
    db.query.guests.findMany({ where: eq(schema.guests.eventId, id), orderBy: asc(schema.guests.name) }),
  ]);
  const unseated = guests.filter((g) => !g.tableId && g.rsvp !== "NO" && !g.revoked);
  const capacity = tables.reduce((s, t) => s + t.capacity, 0);
  const byZone = ZONES.map((z) => ({ zone: z, tables: tables.filter((t) => t.zone === z) })).filter((z) => z.tables.length);
  const otherZone = tables.filter((t) => !ZONES.includes(t.zone));
  if (otherZone.length) byZone.push({ zone: "Other", tables: otherZone });

  return (
    <div className="space-y-6">
      <EventHeader event={event} active="seating" />
      <Flash sp={sp} />
      <div className="grid gap-5 lg:grid-cols-3">
        <form action={addTables.bind(null, id)} className="card space-y-3">
          <h2 className="h2">Add tables</h2>
          <p className="muted">Match your hall&apos;s layout. Round tables in Nigerian halls usually seat 8–10.</p>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">How many</label><input className="input" name="count" defaultValue="10" inputMode="numeric" /></div>
            <div><label className="label">Seats each</label><input className="input" name="capacity" defaultValue="10" inputMode="numeric" /></div>
            <div><label className="label">Zone</label><select className="input" name="zone" defaultValue="General">{ZONES.map((z) => <option key={z}>{z}</option>)}</select></div>
            <div><label className="label">Name prefix</label><input className="input" name="prefix" defaultValue="Table" /></div>
          </div>
          <SubmitButton>Add tables</SubmitButton>
        </form>
        <div className="card space-y-3 lg:col-span-2">
          <h2 className="h2">Auto-seat</h2>
          <p className="text-sm text-stone-600">
            {tables.length} tables · {capacity} seats · {guests.filter((g) => g.rsvp !== "NO").length} guests attending or pending · {unseated.length} unseated.
            Auto-seat keeps each group together, puts VIPs at the High table / VIP zone and families in the Family zone, and never overfills a table.
          </p>
          <div className="flex gap-2">
            <form action={runAutoSeat.bind(null, id)}><SubmitButton className="btn-gold">Seat unseated guests</SubmitButton></form>
            <form action={runAutoSeat.bind(null, id)}>
              <input type="hidden" name="reset" value="1" />
              <SubmitButton className="btn-outline" confirm="Clear every seat and re-seat everyone?">Re-seat everyone</SubmitButton>
            </form>
          </div>
          {unseated.length > 0 && (
            <div className="max-h-60 space-y-1 overflow-y-auto border-t border-stone-100 pt-3">
              {unseated.map((g) => (
                <form key={g.id} action={assignTable.bind(null, id, g.id)} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{g.name} <span className="text-xs text-stone-500">{g.group}</span></span>
                  <StatusBadge status={g.category} />
                  <select className="input w-40 py-1" name="tableId">{tables.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.guests.length}/{t.capacity})</option>)}</select>
                  <button className="btn-outline btn-sm">Seat</button>
                </form>
              ))}
            </div>
          )}
        </div>
      </div>

      {byZone.map(({ zone, tables }) => (
        <div key={zone} className="space-y-2">
          <h2 className="h2">{zone}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tables.map((t) => {
              const full = t.guests.length >= t.capacity;
              return (
                <div key={t.id} className="card p-4">
                  <details>
                    <summary className="flex cursor-pointer items-center justify-between">
                      <span className="font-semibold">{t.name}</span>
                      <span className={`badge ${full ? "bg-brand-700 text-white" : "bg-stone-100 text-stone-700"}`}>{t.guests.length}/{t.capacity}</span>
                    </summary>
                    <form action={renameTable.bind(null, id, t.id)} className="mt-2 space-y-1">
                      <input className="input py-1" name="name" defaultValue={t.name} />
                      <div className="flex gap-1">
                        <input className="input w-16 py-1" name="capacity" defaultValue={t.capacity} />
                        <select className="input py-1" name="zone" defaultValue={t.zone}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select>
                      </div>
                      <div className="flex gap-1">
                        <button className="btn-outline btn-sm">Save</button>
                      </div>
                    </form>
                    <form action={deleteTable.bind(null, id, t.id)} className="mt-1"><SubmitButton className="btn-danger btn-sm" confirm="Delete table? Its guests become unseated.">Delete table</SubmitButton></form>
                  </details>
                  <ul className="mt-2 space-y-1 text-sm">
                    {t.guests.map((g) => (
                      <li key={g.id} className="flex items-center justify-between gap-1">
                        <span className="truncate">{g.name}</span>
                        <form action={assignTable.bind(null, id, g.id)}>
                          <input type="hidden" name="tableId" value="" />
                          <button className="text-xs text-stone-400 hover:text-red-600" title="Unseat">✕</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
