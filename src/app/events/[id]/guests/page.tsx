import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireEvent } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { APP_URL } from "@/lib/config";
import { Flash, Stat, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { EventHeader } from "../EventHeader";
import { CopyLink } from "./CopyLink";
import { addGuest, deleteGuest, importGuests, reissueCard, setRsvpByHost, toggleRevoke } from "@/app/actions/guests";

export const metadata = { title: "Guests & cards" };

export default async function Guests({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string; q?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { event } = await requireEvent(id);
  const all = await db.query.guests.findMany({ where: eq(schema.guests.eventId, id), with: { table: true }, orderBy: asc(schema.guests.createdAt) });
  const q = sp.q?.toLowerCase();
  const guests = q ? all.filter((g) => g.name.toLowerCase().includes(q) || g.group.toLowerCase().includes(q)) : all;
  const yes = all.filter((g) => g.rsvp === "YES").length;
  const no = all.filter((g) => g.rsvp === "NO").length;
  const seated = all.filter((g) => g.tableId).length;

  return (
    <div className="space-y-6">
      <EventHeader event={event} active="guests" />
      <Flash sp={sp} />
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Guests listed" value={all.length} sub={`Planned: ${event.guestCount}`} />
        <Stat label="Confirmed" value={yes} sub={`${no} declined · ${all.length - yes - no} pending`} />
        <Stat label="Seated" value={seated} />
        <Stat label="Checked in" value={all.filter((g) => g.checkedInAt).length} />
      </div>
      {yes > event.guestCount && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Confirmed guests ({yes}) exceed your planned count ({event.guestCount}). Update catering quantities with your vendor.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <form action={addGuest.bind(null, id)} className="card grid grid-cols-2 gap-3">
          <h2 className="h2 col-span-2">Add a guest</h2>
          <input className="input col-span-2" name="name" placeholder="Full name" required />
          <input className="input" name="phone" placeholder="Phone (for WhatsApp)" />
          <input className="input" name="group" placeholder="Seat-together group, e.g. Adeyemi family" />
          <select className="input" name="side"><option>Both</option><option>Bride</option><option>Groom</option></select>
          <select className="input" name="category"><option>GENERAL</option><option>FAMILY</option><option>VIP</option><option>CREW</option></select>
          <div className="col-span-2"><SubmitButton>Add guest</SubmitButton></div>
        </form>
        <form action={importGuests.bind(null, id)} className="card space-y-3">
          <h2 className="h2">Bulk import</h2>
          <p className="muted">One guest per line: <code>name, phone, side, group, category</code>. You can paste from Excel or Google Sheets (export as CSV).</p>
          <textarea className="input font-mono text-xs" name="lines" rows={5} placeholder={"Chief Adeyemi, 08031234567, Bride, Adeyemi family, VIP\nNgozi Okafor, 08098765432, Groom, Okafor family, FAMILY\nTunde Bakare, , Both, Uni friends, GENERAL"} />
          <SubmitButton>Import guests</SubmitButton>
        </form>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          <h2 className="h2">Guest list & access cards</h2>
          <div className="flex gap-2">
            <form><input className="input py-1" name="q" defaultValue={sp.q} placeholder="Search…" /></form>
            <Link href={`/events/${id}/cards`} className="btn-gold btn-sm" target="_blank">Print all cards</Link>
          </div>
        </div>
        <table className="table mt-3">
          <thead><tr><th>Name</th><th>Group</th><th>Category</th><th>RSVP</th><th>Table</th><th>Card link</th><th></th></tr></thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id} className={g.revoked ? "opacity-50" : ""}>
                <td className="font-medium">{g.name}<div className="text-xs text-stone-500">{g.side}{g.phone ? ` · ${g.phone}` : ""}</div></td>
                <td>{g.group || "—"}</td>
                <td><StatusBadge status={g.category} /></td>
                <td>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={g.rsvp} />
                    {g.rsvp !== "YES" && <form action={setRsvpByHost.bind(null, id, g.id, "YES")}><button className="text-xs text-brand-700">✓</button></form>}
                    {g.rsvp !== "NO" && <form action={setRsvpByHost.bind(null, id, g.id, "NO")}><button className="text-xs text-stone-500">✕</button></form>}
                  </div>
                  {g.checkedInAt && <div className="text-xs text-emerald-700">Checked in</div>}
                </td>
                <td>{g.table?.name ?? "—"}</td>
                <td><CopyLink url={`${APP_URL}/card/${g.token}`} name={g.name} phone={g.phone} event={event.title} /></td>
                <td className="whitespace-nowrap">
                  <div className="flex gap-1">
                    <Link href={`/card/${g.token}`} target="_blank" className="btn-outline btn-sm">Card</Link>
                    <form action={reissueCard.bind(null, id, g.id)}><SubmitButton className="btn-outline btn-sm" confirm="Issue a new QR code? The old one stops working.">Re-issue</SubmitButton></form>
                    <form action={toggleRevoke.bind(null, id, g.id)}><SubmitButton className="btn-outline btn-sm">{g.revoked ? "Restore" : "Revoke"}</SubmitButton></form>
                    <form action={deleteGuest.bind(null, id, g.id)}><SubmitButton className="btn-danger btn-sm" confirm="Delete guest?">✕</SubmitButton></form>
                  </div>
                </td>
              </tr>
            ))}
            {guests.length === 0 && <tr><td colSpan={7} className="muted">No guests yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
