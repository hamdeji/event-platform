import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fmtDate, naira } from "@/lib/format";

export const metadata = { title: "My events" };

export default async function Events() {
  const user = await requireUser(["CLIENT", "ADMIN"]);
  const events = await db.query.events.findMany({
    where: eq(schema.events.ownerId, user.id),
    orderBy: desc(schema.events.date),
    with: { plan: true, bookings: true, guests: { columns: { id: true } } },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="h1">My events</h1>
        <Link href="/events/new" className="btn-primary">+ Plan a new event</Link>
      </div>
      {events.length === 0 && (
        <div className="card text-center">
          <p className="text-stone-600">No events yet. Tell us about your wedding and the AI planner will build your budget.</p>
          <Link href="/events/new" className="btn-gold mt-4">Start planning</Link>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {events.map((e) => {
          const days = Math.ceil((e.date.getTime() - Date.now()) / 86_400_000);
          return (
            <Link key={e.id} href={`/events/${e.id}/plan`} className="card block hover:border-brand-600">
              <div className="flex items-start justify-between">
                <div>
                  <div className="h2">{e.title}</div>
                  <div className="muted">{fmtDate(e.date)} · {e.city} · {e.guestCount} guests</div>
                </div>
                <span className="badge bg-brand-50 text-brand-700">{days > 0 ? `${days} day${days === 1 ? "" : "s"} to go` : "Past"}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div><div className="muted">Budget</div><div className="font-semibold">{naira(e.plan?.totalBudget)}</div></div>
                <div><div className="muted">Bookings</div><div className="font-semibold">{e.bookings.length}</div></div>
                <div><div className="muted">Guests listed</div><div className="font-semibold">{e.guests.length}</div></div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
