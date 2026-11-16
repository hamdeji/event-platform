import { requireUser } from "@/lib/auth";
import { GateScanner } from "@/components/GateScanner";

export const metadata = { title: "Gate check-in" };

export default async function GateEvent({ params }: { params: Promise<{ eventId: string }> }) {
  await requireUser(["GATE", "ADMIN"]);
  return <GateScanner eventId={(await params).eventId} />;
}
