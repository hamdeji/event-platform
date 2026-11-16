import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { categoryName } from "@/lib/packs";
import { fmtDate, naira } from "@/lib/format";
import { Flash, Stars, TierBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { requestQuote } from "@/app/actions/bookings";
import Link from "next/link";

export default async function VendorPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; event?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const vendor = await db.query.vendors.findFirst({
    where: eq(schema.vendors.slug, slug),
    with: { packages: true, reviews: { orderBy: desc(schema.reviews.createdAt), limit: 10, with: { client: { columns: { name: true } } } } },
  });
  if (!vendor) notFound();
  const s = await getSession();
  const myEvents = s?.role === "CLIENT" ? await db.query.events.findMany({ where: eq(schema.events.ownerId, s.userId), orderBy: desc(schema.events.date) }) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="h1">{vendor.businessName}</h1>
              <div className="muted">{categoryName(vendor.category)} · {vendor.city}, {vendor.state}</div>
            </div>
            <TierBadge tier={vendor.tier} />
          </div>
          <p className="mt-4 text-stone-700">{vendor.description || "This vendor has not added a description yet."}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div><div className="muted">Rating</div><Stars rating={vendor.rating} count={vendor.reviewCount} /></div>
            <div><div className="muted">Escrow bookings</div><div className="font-semibold">{vendor.completedBookings}</div></div>
            <div><div className="muted">Serves</div><div className="font-semibold">{vendor.serviceAreas.replaceAll(",", ", ") || vendor.city}</div></div>
            <div><div className="muted">Checks</div><div className="text-xs">{vendor.idVerified ? `✓ ${vendor.idType}` : "ID pending"}{vendor.cacNumber ? " · ✓ CAC" : ""}</div></div>
          </div>
          {vendor.styles && (
            <div className="mt-4 flex flex-wrap gap-1">
              {vendor.styles.split(",").map((t) => <span key={t} className="badge bg-stone-100 text-stone-700">{t}</span>)}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="h2">Packages</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {vendor.packages.map((p) => (
              <div key={p.id} className="rounded-lg border border-stone-200 p-4">
                <div className="flex justify-between font-semibold"><span>{p.name}</span><span>{naira(p.price)}</span></div>
                <div className="text-xs text-stone-500">{p.unit}</div>
                <p className="mt-2 text-sm text-stone-600">{p.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="h2">Reviews from escrow-verified clients</h2>
          {vendor.reviews.length === 0 && <p className="muted mt-2">No platform reviews yet.</p>}
          <div className="mt-3 space-y-4">
            {vendor.reviews.map((r) => (
              <div key={r.id} className="border-b border-stone-100 pb-3 text-sm">
                <div className="flex justify-between">
                  <b>{r.client.name.split(" ")[0]}</b>
                  <span className="muted">{fmtDate(r.createdAt)}</span>
                </div>
                <div className="text-xs text-stone-500">
                  Punctuality {r.punctuality}/5 · Quality {r.quality}/5 · Communication {r.communication}/5 · Value {r.value}/5
                </div>
                <p className="mt-1">{r.comment}</p>
                {r.vendorReply && <p className="mt-1 rounded bg-stone-50 p-2 text-stone-600">Vendor reply: {r.vendorReply}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card sticky top-4">
          <div className="text-sm text-stone-500">Starting from</div>
          <div className="text-2xl font-bold">{naira(vendor.priceFrom)} <span className="text-sm font-normal text-stone-500">{vendor.priceUnit}</span></div>
          <Flash sp={sp} />
          {vendor.tier === "LISTED" ? (
            <p className="mt-3 text-sm text-amber-800">This vendor is still being verified and cannot take escrow bookings yet.</p>
          ) : s?.role === "CLIENT" ? (
            myEvents.length ? (
              <form action={requestQuote.bind(null, vendor.id)} className="mt-4 space-y-3">
                <div>
                  <label className="label">For which event?</label>
                  <select className="input" name="eventId" defaultValue={sp.event}>
                    {myEvents.map((e) => <option key={e.id} value={e.id}>{e.title} · {fmtDate(e.date)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">What do you need?</label>
                  <textarea className="input" name="brief" rows={4} placeholder="300 guests, jollof + fried rice + small chops, 6 servers, service 4–8pm…" required />
                </div>
                <SubmitButton className="btn-primary w-full">Request a quote</SubmitButton>
                <p className="text-xs text-stone-500">Phone numbers stay hidden until a booking is funded. All payments go through escrow.</p>
              </form>
            ) : (
              <Link href="/events/new" className="btn-primary mt-4 w-full">Create an event to request quotes</Link>
            )
          ) : (
            <Link href={`/login?next=/vendors/${vendor.slug}`} className="btn-primary mt-4 w-full">Log in to request a quote</Link>
          )}
        </div>
      </aside>
    </div>
  );
}
