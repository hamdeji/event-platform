import Link from "next/link";
import { statusLabel } from "@/lib/format";

const COLORS: Record<string, string> = {
  REQUESTED: "bg-sky-100 text-sky-800",
  QUOTED: "bg-violet-100 text-violet-800",
  ACCEPTED: "bg-amber-100 text-amber-800",
  CONTRACT_SIGNED: "bg-teal-100 text-teal-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  DELIVERED: "bg-lime-100 text-lime-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  DISPUTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-stone-200 text-stone-700",
  DECLINED: "bg-stone-200 text-stone-700",
  PENDING: "bg-stone-100 text-stone-700",
  FUNDED: "bg-blue-100 text-blue-800",
  RELEASE_REQUESTED: "bg-amber-100 text-amber-800",
  RELEASED: "bg-emerald-100 text-emerald-800",
  REFUNDED: "bg-stone-200 text-stone-700",
  OPEN: "bg-red-100 text-red-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  YES: "bg-emerald-100 text-emerald-800",
  NO: "bg-stone-200 text-stone-600",
  PRO: "bg-gold-400 text-stone-900",
  VERIFIED: "bg-brand-100 text-brand-800",
  LISTED: "bg-stone-100 text-stone-600",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  NOT_SUBMITTED: "bg-stone-100 text-stone-600",
  VIP: "bg-gold-400 text-stone-900",
  FAMILY: "bg-rose-100 text-rose-800",
  GENERAL: "bg-sky-100 text-sky-800",
  CREW: "bg-stone-200 text-stone-700",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${COLORS[status] ?? "bg-stone-100 text-stone-700"}`}>{label ?? statusLabel(status)}</span>;
}

export function TierBadge({ tier }: { tier: string }) {
  const label = tier === "PRO" ? "★ Verified Pro" : tier === "VERIFIED" ? "✓ Verified" : "Listed";
  return <StatusBadge status={tier} label={label} />;
}

export function Stars({ rating, count }: { rating: number; count?: number }) {
  if (!rating) return <span className="muted">No reviews yet</span>;
  return (
    <span className="text-sm text-stone-700">
      <span className="text-gold-500">★</span> {rating.toFixed(1)}
      {count != null && <span className="text-stone-400"> ({count})</span>}
    </span>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warn"; children: React.ReactNode }) {
  const cls = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    error: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  }[kind];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Flash({ sp }: { sp: { error?: string; ok?: string } }) {
  return (
    <>
      {sp.error && <Alert kind="error">{sp.error}</Alert>}
      {sp.ok && <Alert kind="success">{sp.ok}</Alert>}
    </>
  );
}

export function EventTabs({ id, active }: { id: string; active: string }) {
  const tabs = [
    ["plan", "Plan & budget"],
    ["vendors", "Vendors & bookings"],
    ["guests", "Guests & cards"],
    ["seating", "Seating"],
    ["gate", "Gate"],
  ];
  return (
    <div className="no-print flex flex-wrap gap-1 border-b border-stone-200">
      {tabs.map(([k, l]) => (
        <Link
          key={k}
          href={`/events/${id}/${k}`}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${active === k ? "border-brand-700 text-brand-700" : "border-transparent text-stone-500 hover:text-stone-800"}`}
        >
          {l}
        </Link>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-stone-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-stone-500">{sub}</div>}
    </div>
  );
}
