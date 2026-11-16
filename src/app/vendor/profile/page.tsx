import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { naira } from "@/lib/format";
import { Flash, StatusBadge, TierBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addPackage, deletePackage, submitKyc, updateProfile } from "@/app/actions/vendor";

export const metadata = { title: "My business" };

export default async function VendorProfile({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser(["VENDOR"]);
  const v = user.vendor!;
  const packages = await db.query.vendorPackages.findMany({ where: eq(schema.vendorPackages.vendorId, v.id) });
  return (
    <div className="space-y-6">
      <h1 className="h1">My business</h1>
      <Flash sp={sp} />
      <form action={updateProfile} className="card grid gap-4 md:grid-cols-2">
        <h2 className="h2 md:col-span-2">Public profile</h2>
        <div><label className="label">Business name</label><input className="input" name="businessName" defaultValue={v.businessName} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">City</label><input className="input" name="city" defaultValue={v.city} /></div>
          <div><label className="label">State</label><input className="input" name="state" defaultValue={v.state} /></div>
        </div>
        <div className="md:col-span-2"><label className="label">Description</label><textarea className="input" name="description" rows={4} defaultValue={v.description} /></div>
        <div><label className="label">Styles (comma-separated)</label><input className="input" name="styles" defaultValue={v.styles} placeholder="Glam / owambe, Classic" /></div>
        <div><label className="label">Cities you serve (comma-separated)</label><input className="input" name="serviceAreas" defaultValue={v.serviceAreas} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Starting price (₦)</label><input className="input" name="priceFrom" defaultValue={v.priceFrom.toLocaleString()} /></div>
          <div><label className="label">Unit</label>
            <select className="input" name="priceUnit" defaultValue={v.priceUnit}><option>per event</option><option>per guest</option><option>per day</option></select>
          </div>
        </div>
        <div className="flex items-end"><SubmitButton>Save profile</SubmitButton></div>
      </form>

      <div className="card">
        <h2 className="h2">Packages</h2>
        <div className="mt-3 space-y-2">
          {packages.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-stone-200 p-3 text-sm">
              <div><b>{p.name}</b> · {naira(p.price)} {p.unit}<div className="text-stone-500">{p.description}</div></div>
              <form action={deletePackage.bind(null, p.id)}><SubmitButton className="btn-danger btn-sm" confirm="Delete package?">Delete</SubmitButton></form>
            </div>
          ))}
        </div>
        <form action={addPackage} className="mt-4 grid gap-2 md:grid-cols-5">
          <input className="input" name="name" placeholder="Package name" />
          <input className="input md:col-span-2" name="description" placeholder="What's included" />
          <input className="input" name="price" placeholder="Price ₦" />
          <button className="btn-outline">+ Add package</button>
        </form>
      </div>

      <form action={submitKyc} className="card grid gap-4 md:grid-cols-2">
        <div className="flex items-center justify-between md:col-span-2">
          <h2 className="h2">Verification & payouts</h2>
          <div className="flex gap-2"><TierBadge tier={v.tier} /><StatusBadge status={v.kycStatus} /></div>
        </div>
        <p className="muted md:col-span-2">
          Verified vendors can receive escrow bookings and appear in AI matching. We check your BVN or NIN against your bank account name, and your CAC registration.
          Verified Pro unlocks after 10 completed bookings with a rating of 4.5 or higher and lowers your commission.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div><label className="label">ID type</label><select className="input" name="idType" defaultValue={v.idType ?? "BVN"}><option>BVN</option><option>NIN</option></select></div>
          <div className="col-span-2"><label className="label">ID number (not stored)</label><input className="input" name="idNumber" inputMode="numeric" maxLength={11} required /></div>
        </div>
        <div><label className="label">CAC number (business name or company)</label><input className="input" name="cacNumber" defaultValue={v.cacNumber ?? ""} placeholder="BN1234567 or RC123456" /></div>
        <div><label className="label">Bank</label><input className="input" name="bankName" defaultValue={v.bankName ?? ""} required /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Account number</label><input className="input" name="bankAccountNumber" inputMode="numeric" maxLength={10} placeholder={v.bankAccountNumber ?? ""} required /></div>
          <div><label className="label">Account name</label><input className="input" name="bankAccountName" defaultValue={v.bankAccountName ?? ""} required /></div>
        </div>
        <div><SubmitButton>Submit for verification</SubmitButton></div>
      </form>
    </div>
  );
}
