import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { getPack } from "@/lib/packs";

export const metadata = { title: "Create account" };

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string; role?: string }> }) {
  const sp = await searchParams;
  const vendor = sp.role === "VENDOR";
  const pack = getPack("wedding");
  return (
    <div className="mx-auto max-w-md space-y-4 py-10">
      <h1 className="h1">{vendor ? "List your business" : "Start planning"}</h1>
      <div className="flex gap-2 text-sm">
        <Link href="/signup" className={!vendor ? "btn-primary btn-sm" : "btn-outline btn-sm"}>I&apos;m planning an event</Link>
        <Link href="/signup?role=VENDOR" className={vendor ? "btn-primary btn-sm" : "btn-outline btn-sm"}>I&apos;m a vendor</Link>
      </div>
      <Flash sp={sp} />
      <form action={signup} className="card space-y-4">
        <input type="hidden" name="role" value={vendor ? "VENDOR" : "CLIENT"} />
        <div>
          <label className="label">Your full name</label>
          <input className="input" name="name" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Email</label>
            <input className="input" name="email" type="email" required />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" name="phone" placeholder="0803..." />
          </div>
        </div>
        {vendor && (
          <>
            <div>
              <label className="label">Business name</label>
              <input className="input" name="businessName" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Service</label>
                <select className="input" name="category" required>
                  {pack.categories.map((c) => (
                    <option key={c.key} value={c.key}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">City</label>
                <input className="input" name="city" defaultValue="Lagos" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Starting price (₦)</label>
                <input className="input" name="priceFrom" inputMode="numeric" required />
              </div>
              <div>
                <label className="label">Priced</label>
                <select className="input" name="priceUnit">
                  <option>per event</option>
                  <option>per guest</option>
                  <option>per day</option>
                </select>
              </div>
            </div>
          </>
        )}
        <div>
          <label className="label">Password</label>
          <input className="input" name="password" type="password" minLength={8} required />
        </div>
        <SubmitButton className="btn-primary w-full">Create account</SubmitButton>
      </form>
      <p className="muted">
        Have an account? <Link href="/login" className="font-semibold text-brand-700">Log in</Link>
      </p>
    </div>
  );
}
