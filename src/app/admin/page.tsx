import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { ledgerBalances } from "@/lib/escrow";
import { categoryName } from "@/lib/packs";
import { fmtDateTime, naira } from "@/lib/format";
import { Flash, Stat, StatusBadge, TierBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { autoRelease, resolve, setVendorStatus } from "@/app/actions/admin";

export const metadata = { title: "Admin" };

export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const [queue, pros, disputes, bal, ledger, [counts]] = await Promise.all([
    db.query.vendors.findMany({ where: inArray(schema.vendors.kycStatus, ["PENDING", "NOT_SUBMITTED"]), with: { user: true }, orderBy: desc(schema.vendors.createdAt) }),
    db.query.vendors.findMany({
      where: sql`${schema.vendors.tier} = 'VERIFIED' and ${schema.vendors.completedBookings} >= 10 and ${schema.vendors.rating} >= 4.5 and ${schema.vendors.disputesLost} * 100 < greatest(${schema.vendors.completedBookings}, 1) * 3`,
    }),
    db.query.disputes.findMany({ where: eq(schema.disputes.status, "OPEN"), with: { booking: { with: { vendor: true, event: true, contract: true } }, milestone: true, openedBy: true } }),
    ledgerBalances(),
    db.query.ledgerEntries.findMany({ orderBy: desc(schema.ledgerEntries.createdAt), limit: 25 }),
    db
      .select({
        users: sql<number>`(select count(*) from users)::int`,
        vendors: sql<number>`(select count(*) from vendors)::int`,
        events: sql<number>`(select count(*) from events)::int`,
        bookings: sql<number>`(select count(*) from bookings)::int`,
      })
      .from(sql`(select 1) as x`),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="h1">Admin & trust</h1>
        <form action={autoRelease}><SubmitButton className="btn-outline">Run auto-release now</SubmitButton></form>
      </div>
      <Flash sp={sp} />
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Held in escrow" value={naira(bal.ESCROW)} sub="Must equal partner custody balance" />
        <Stat label="Platform revenue" value={naira(bal.PLATFORM)} sub="Commission + protection fees" />
        <Stat label="Paid to vendors" value={naira(bal.VENDOR)} />
        <Stat label="Activity" value={`${counts.bookings} bookings`} sub={`${counts.events} events · ${counts.vendors} vendors · ${counts.users} users`} />
      </div>

      <div className="card">
        <h2 className="h2">Open disputes ({disputes.length})</h2>
        {disputes.length === 0 && <p className="muted mt-2">None. 🎉</p>}
        <div className="mt-3 space-y-4">
          {disputes.map((d) => (
            <div key={d.id} className="rounded-lg border border-red-200 p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <b>{d.booking.vendor.businessName}</b> · {d.booking.event.title} · {d.milestone.label} {naira(d.milestone.amount)}
                  <div className="text-sm text-stone-600">Opened by {d.openedBy.name} {fmtDateTime(d.createdAt)}: “{d.reason}”</div>
                </div>
                <Link href={`/bookings/${d.bookingId}`} className="btn-outline btn-sm">Evidence: chat, contract, payments</Link>
              </div>
              <form action={resolve.bind(null, d.id)} className="mt-3 flex flex-wrap gap-2">
                <input className="input w-40" name="vendorPercent" placeholder="% to vendor" inputMode="numeric" required />
                <input className="input flex-1" name="resolution" placeholder="Decision and reason (visible to both parties)" required />
                <SubmitButton className="btn-primary" confirm="Distribute the funds as decided?">Resolve</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="h2">Verification queue ({queue.length})</h2>
          <div className="mt-3 space-y-3">
            {queue.map((v) => (
              <div key={v.id} className="rounded-lg border border-stone-200 p-3 text-sm">
                <div className="flex justify-between"><b>{v.businessName}</b><StatusBadge status={v.kycStatus} /></div>
                <div className="text-stone-600">{categoryName(v.category)} · {v.city} · {v.user.email}</div>
                <div className="text-xs text-stone-500">ID: {v.idType ?? "—"} · CAC: {v.cacNumber ?? "—"} · Bank: {v.bankName ?? "—"} {v.bankAccountNumber ?? ""} ({v.bankAccountName ?? "—"})</div>
                <div className="mt-2 flex gap-2">
                  <form action={setVendorStatus.bind(null, v.id, "approve")}><SubmitButton className="btn-primary btn-sm">Approve → Verified</SubmitButton></form>
                  <form action={setVendorStatus.bind(null, v.id, "reject")}><SubmitButton className="btn-danger btn-sm">Reject</SubmitButton></form>
                </div>
              </div>
            ))}
            {queue.length === 0 && <p className="muted">Queue is empty.</p>}
          </div>
        </div>
        <div className="card">
          <h2 className="h2">Eligible for Verified Pro</h2>
          <p className="muted">10+ completed bookings, rating ≥ 4.5, disputes lost &lt; 3%.</p>
          <div className="mt-3 space-y-2">
            {pros.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm">
                <span>{v.businessName} <TierBadge tier={v.tier} /></span>
                <form action={setVendorStatus.bind(null, v.id, "pro")}><SubmitButton className="btn-gold btn-sm">Promote</SubmitButton></form>
              </div>
            ))}
            {pros.length === 0 && <p className="muted">No vendors eligible right now.</p>}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="h2 px-5 pt-5">Ledger (latest 25)</h2>
        <table className="table mt-3">
          <thead><tr><th>Time</th><th>Debit → Credit</th><th>Memo</th><th>Ref</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                <td className="whitespace-nowrap">{l.debit} → {l.credit}</td>
                <td>{l.memo}</td>
                <td className="text-xs text-stone-500">{l.ref}</td>
                <td className="text-right font-semibold">{naira(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
