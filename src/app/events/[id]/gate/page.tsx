import { requireEvent } from "@/lib/auth";
import { GateScanner } from "@/components/GateScanner";
import { EventHeader } from "../EventHeader";

export const metadata = { title: "Gate check-in" };

export default async function Gate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await requireEvent(id);
  return (
    <div className="space-y-6">
      <EventHeader event={event} active="gate" />
      <p className="muted text-center">Open this page on the ushers&apos; phones before guests arrive. After the list downloads, scanning works without internet.</p>
      <GateScanner eventId={id} />
    </div>
  );
}
