import type { Event } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { EventTabs } from "@/components/ui";

export function EventHeader({ event, active }: { event: Event; active: string }) {
  const days = Math.ceil((event.date.getTime() - Date.now()) / 86_400_000);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">{event.title}</h1>
          <p className="muted">
            {event.hostNames} · {fmtDate(event.date)} · {event.city} · {event.guestCount} guests · {event.culture}
          </p>
        </div>
        <span className="badge bg-gold-400 px-3 py-1 text-stone-900">{days > 0 ? `${days} day${days === 1 ? "" : "s"} to go` : days === 0 ? "Today!" : "Past event"}</span>
      </div>
      <EventTabs id={event.id} active={active} />
    </div>
  );
}
