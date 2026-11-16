import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fmtDate, naira } from "@/lib/format";
import { Alert, Stat, StatusBadge, TierBadge } from "@/components/ui";

export const metadata = { title: "Vendor dashboard" };

export default async function VendorHome() {
  const user = await requireUser(["VENDOR"]);
  const v = user.vendor!;
  const bookings = await db.query.bookings.findMany({
    where: eq(schema.bookings.vendorId, v.id),
    with: { event: true, client: { columns: { name: true } }, milestones: true },
    orderBy: desc(schema.bookings.updatedAt),
  });
  const ids = bookings.map((b) => b.id);
  const ledger = ids.length ? await db.select().from(schema.ledgerEntries).where(inArray(schema.ledgerEntries.bookingId, ids)) : [];
  const earned = ledger.filter((l) => l.credit === "VENDOR").reduce((s, l) => s + l.amount, 0);
  const held = bookings.flatMap((b) => b.milestones).filter((m) => ["FUNDED", "RELEASE_REQUESTED", "DISPUTED"].includes(m.status)).reduce((s, m) => s + m.amount, 0);
  const newRequests = bookings.filter((b) => b.status === "REQUESTED").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="h1">{v.businessName}</h1>
          <div className="muted">{v.city} · <TierBadge tier={v.tier} /></div>
        </div>
        <Link href={`/vendors/${v.slug}`} className="btn-outline">View public profile</Link>
      </div>
      {v.tier === "LISTED" && (
        <Alert kind="warn">
          You are listed but not yet verified, so clients cannot book you through escrow.{" "}
          <Link href="/vendor/profile" className="font-semibold underline">Complete verification</Link>.
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="New requests" value={newRequests} />
        <Stat label="Held in escrow for you" value={naira(held)} sub="Released after delivery" />
        <Stat label="Paid out (net)" value={naira(earned)} />
        <Stat label="Rating" value={v.rating ? v.rating.toFixed(1) : "—"} sub={`${v.reviewCount} reviews · ${v.completedBookings} completed`} />
      </div>
      <div className="card overflow-x-auto p-0">
        <h2 className="h2 px-5 pt-5">Bookings</h2>
        <table className="table mt-3">
          <thead><tr><th>Event</th><th>Date</th><th>Client</th><th>Status</th><th className="text-right">Quote</th><th></th></tr></thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td className="font-medium">{b.event.title}<div className="text-xs text-stone-500">{b.event.city} · {b.event.guestCount} guests</div></td>
                <td className="whitespace-nowrap">{fmtDate(b.event.date)}</td>
                <td>{b.client.name}</td>
                <td><StatusBadge status={b.status} /></td>
                <td className="text-right">{naira(b.quoteAmount)}</td>
                <td className="text-right"><Link href={`/bookings/${b.id}`} className="btn-primary btn-sm">Open</Link></td>
              </tr>
            ))}
            {bookings.length === 0 && <tr><td colSpan={6} className="muted">No bookings yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
