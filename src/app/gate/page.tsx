import Link from "next/link";
import { and, asc, gte, lte } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Gate" };

export default async function GateHome() {
  await requireUser(["GATE", "ADMIN"]);
  const from = new Date(Date.now() - 2 * 86_400_000);
  const to = new Date(Date.now() + 7 * 86_400_000);
  const events = await db.query.events.findMany({ where: and(gte(schema.events.date, from), lte(schema.events.date, to)), orderBy: asc(schema.events.date) });
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="h1">Events this week</h1>
      {events.map((e) => (
        <Link key={e.id} href={`/gate/${e.id}`} className="card block hover:border-brand-600">
          <div className="font-semibold">{e.title}</div>
          <div className="muted">{fmtDate(e.date)} · {e.venueName ?? e.city}</div>
        </Link>
      ))}
      {events.length === 0 && <p className="muted">No events in the next 7 days.</p>}
    </div>
  );
}
