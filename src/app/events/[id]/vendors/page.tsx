import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { requireEvent } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { matchVendors, estimateVendorCost } from "@/lib/matching";
import { categoryName } from "@/lib/packs";
import { naira } from "@/lib/format";
import { Stars, StatusBadge, TierBadge } from "@/components/ui";
import { EventHeader } from "../EventHeader";

export const metadata = { title: "Vendors & bookings" };

export default async function EventVendors({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ category?: string; budget?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { event } = await requireEvent(id);
  const [plan, bookings] = await Promise.all([
    db.query.plans.findFirst({ where: eq(schema.plans.eventId, id), with: { items: { orderBy: asc(schema.planItems.sort) } } }),
    db.query.bookings.findMany({ where: eq(schema.bookings.eventId, id), with: { vendor: true }, orderBy: desc(schema.bookings.updatedAt) }),
  ]);
  const categories = [...new Set((plan?.items ?? []).map((i) => i.category))];
  const category = sp.category ?? categories[0];
  const budgetLine = sp.budget ? Number(sp.budget) : plan?.items.filter((i) => i.category === category).reduce((s, i) => s + i.amount, 0);
  const matches = category ? await matchVendors(event, category, budgetLine || undefined) : [];

  return (
    <div className="space-y-6">
      <EventHeader event={event} active="vendors" />

      <div className="card overflow-x-auto p-0">
        <h2 className="h2 px-5 pt-5">Your bookings</h2>
        {bookings.length === 0 ? (
          <p className="muted px-5 pb-5 pt-2">No quote requests yet. Pick a category below and request quotes from matched vendors.</p>
        ) : (
          <table className="table mt-3">
            <thead>
              <tr><th>Vendor</th><th>Service</th><th>Status</th><th className="text-right">Quote</th><th></th></tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td className="font-medium">{b.vendor.businessName}</td>
                  <td>{categoryName(b.category)}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="text-right">{naira(b.quoteAmount)}</td>
                  <td className="text-right"><Link href={`/bookings/${b.id}`} className="btn-outline btn-sm">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Link key={c} href={`/events/${id}/vendors?category=${c}`} className={c === category ? "btn-primary btn-sm" : "btn-outline btn-sm"}>
              {categoryName(c)}
            </Link>
          ))}
        </div>
        {category && (
          <div className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h2">Best matches: {categoryName(category)}</h2>
              <span className="muted">Budget line {naira(budgetLine)} · ranked by price fit, rating, verification, style and track record</span>
            </div>
            {matches.length === 0 && (
              <p className="muted mt-3">
                No verified vendors in {event.city} for this category yet. <Link className="text-brand-700 underline" href={`/vendors?category=${category}`}>Browse all cities</Link>
              </p>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {matches.map(({ vendor: v, score, reasons, available }) => {
                const est = estimateVendorCost(v, event.guestCount);
                return (
                  <div key={v.id} className={`rounded-lg border p-4 ${available ? "border-stone-200" : "border-stone-200 opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/vendors/${v.slug}?event=${id}`} className="font-semibold hover:text-brand-700">{v.businessName}</Link>
                        <div className="text-xs text-stone-500">Match score {score}/100</div>
                      </div>
                      <TierBadge tier={v.tier} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <Stars rating={v.rating} count={v.reviewCount} />
                      <span>est. <b>{naira(est)}</b></span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {!available && <span className="badge bg-red-100 text-red-800">Booked on your date</span>}
                      {reasons.map((r) => (
                        <span key={r} className={`badge ${r.includes("Above") ? "bg-amber-100 text-amber-800" : "bg-brand-50 text-brand-700"}`}>{r}</span>
                      ))}
                    </div>
                    <Link href={`/vendors/${v.slug}?event=${id}`} className="btn-primary btn-sm mt-3">View & request quote</Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
