import Link from "next/link";
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getPack, categoryName } from "@/lib/packs";
import { naira } from "@/lib/format";
import { Stars, TierBadge } from "@/components/ui";

export const metadata = { title: "Find vendors" };

export default async function Vendors({ searchParams }: { searchParams: Promise<{ category?: string; city?: string; q?: string; verified?: string }> }) {
  const sp = await searchParams;
  const v = schema.vendors;
  const where: SQL[] = [];
  if (sp.category) where.push(eq(v.category, sp.category));
  if (sp.city) where.push(sql`lower(${v.city}) = lower(${sp.city})`);
  if (sp.q) where.push(or(ilike(v.businessName, `%${sp.q}%`), ilike(v.description, `%${sp.q}%`))!);
  where.push(sp.verified === "pro" ? eq(v.tier, "PRO") : inArray(v.tier, ["VERIFIED", "PRO"]));
  const list = await db.select().from(v).where(and(...where)).orderBy(desc(sql`case ${v.tier} when 'PRO' then 2 when 'VERIFIED' then 1 else 0 end`), desc(v.rating)).limit(60);
  const pack = getPack("wedding");

  return (
    <div className="space-y-5">
      <h1 className="h1">Verified vendors</h1>
      <form className="card grid gap-3 md:grid-cols-5">
        <input className="input md:col-span-2" name="q" defaultValue={sp.q} placeholder="Search name or service" />
        <select className="input" name="category" defaultValue={sp.category ?? ""}>
          <option value="">All services</option>
          {pack.categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
        <select className="input" name="city" defaultValue={sp.city ?? ""}>
          <option value="">All cities</option>
          {["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Enugu"].map((c) => <option key={c}>{c}</option>)}
        </select>
        <div className="flex gap-2">
          <select className="input" name="verified" defaultValue={sp.verified ?? ""}>
            <option value="">Verified + Pro</option>
            <option value="pro">Verified Pro only</option>
          </select>
          <button className="btn-primary">Search</button>
        </div>
      </form>
      <div className="grid gap-4 md:grid-cols-3">
        {list.map((x) => (
          <Link key={x.id} href={`/vendors/${x.slug}`} className="card block hover:border-brand-600">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold">{x.businessName}</div>
              <TierBadge tier={x.tier} />
            </div>
            <div className="muted">{categoryName(x.category)} · {x.city}</div>
            <p className="mt-2 line-clamp-2 text-sm text-stone-600">{x.description}</p>
            <div className="mt-3 flex items-center justify-between">
              <Stars rating={x.rating} count={x.reviewCount} />
              <span className="text-sm font-semibold">from {naira(x.priceFrom)} <span className="font-normal text-stone-500">{x.priceUnit}</span></span>
            </div>
          </Link>
        ))}
        {list.length === 0 && <p className="muted">No vendors match these filters yet.</p>}
      </div>
    </div>
  );
}
