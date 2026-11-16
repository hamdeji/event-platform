import Link from "next/link";
import { BRAND } from "@/lib/config";

const features = [
  ["AI budget planner", "Tell us your budget, or just your wishes. Get a costed plan in three tiers with honest warnings."],
  ["Verified vendors", "BVN/NIN, CAC and bank checks, plus reviews only from clients who actually paid through escrow."],
  ["Escrow payments", "Your money is held by a licensed partner and released in milestones after delivery."],
  ["Contracts in one tap", "Every accepted quote becomes a clear contract both sides sign with a one-time code."],
  ["QR access cards", "Each guest gets a personal QR pass and table number. The gate app works offline."],
  ["Seating made easy", "Set up your hall's tables and let auto-seating keep families together."],
];

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-10 rounded-2xl bg-brand-800 px-8 py-14 text-white md:grid-cols-2">
        <div className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-400">Weddings first. Every celebration next.</p>
          <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">Plan your Nigerian wedding without the wahala.</h1>
          <p className="text-lg text-brand-100">
            {BRAND.name} builds your budget, matches you with verified vendors, and holds payments in escrow until each job is delivered.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="btn-gold px-6 py-3 text-base">Plan my wedding</Link>
            <Link href="/signup?role=VENDOR" className="btn border border-brand-100/40 px-6 py-3 text-base text-white hover:bg-brand-700">I&apos;m a vendor</Link>
          </div>
        </div>
        <div className="rounded-xl bg-white/10 p-6 text-sm">
          <div className="mb-3 font-semibold text-gold-400">Sample plan · 300 guests · Lagos</div>
          {[
            ["Venue", "₦2,500,000"],
            ["Catering (300 plates)", "₦1,650,000"],
            ["Decor & lighting", "₦1,200,000"],
            ["Photography & video", "₦900,000"],
            ["DJ, band & MC", "₦700,000"],
            ["Contingency (10%)", "₦900,000"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-white/10 py-2">
              <span>{k}</span>
              <span className="font-semibold">{v}</span>
            </div>
          ))}
          <div className="mt-3 text-xs text-brand-100">Illustrative only. Your plan is built from your city, guest count and style.</div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {features.map(([t, d]) => (
          <div key={t} className="card">
            <h3 className="h2">{t}</h3>
            <p className="mt-2 text-sm text-stone-600">{d}</p>
          </div>
        ))}
      </section>

      <section className="card grid gap-6 md:grid-cols-4">
        {["Describe your event", "Get your AI plan", "Book & sign contracts", "Pay into escrow, release on delivery"].map((s, i) => (
          <div key={s}>
            <div className="text-3xl font-extrabold text-gold-500">{i + 1}</div>
            <div className="mt-1 font-semibold">{s}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
