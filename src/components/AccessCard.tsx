import type { Event, Guest, SeatTable } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { BRAND } from "@/lib/config";

const BAND: Record<string, string> = {
  VIP: "bg-gold-400 text-stone-900",
  FAMILY: "bg-rose-600 text-white",
  GENERAL: "bg-brand-700 text-white",
  CREW: "bg-stone-700 text-white",
};

export function AccessCard({ guest, event, table, qr }: { guest: Guest; event: Event; table: SeatTable | null; qr: string }) {
  const monogram = event.hostNames
    .split(/&|and/i)
    .map((n) => n.trim()[0])
    .filter(Boolean)
    .join(" & ");
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-md break-inside-avoid">
      <div className="bg-brand-800 px-6 py-5 text-center text-white">
        <div className="font-serif text-3xl text-gold-400">{monogram}</div>
        <div className="mt-1 text-lg font-semibold">{event.hostNames}</div>
        <div className="text-sm text-brand-100">{fmtDate(event.date)} · {event.venueName ?? event.city}</div>
      </div>
      <div className={`py-1 text-center text-xs font-bold uppercase tracking-widest ${BAND[guest.category]}`}>{guest.category === "GENERAL" ? "Guest" : guest.category}</div>
      <div className="flex flex-col items-center px-6 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Access QR code" className="h-48 w-48" />
        <div className="mt-3 text-xl font-bold">{guest.name}</div>
        <div className="mt-1 text-sm text-stone-600">{table ? <>Table: <b className="text-stone-900">{table.name}</b></> : "Table assigned on arrival"}</div>
      </div>
      <div className="border-t border-stone-100 py-2 text-center text-[10px] text-stone-400">Admit one · Non-transferable · Powered by {BRAND.name}</div>
    </div>
  );
}
