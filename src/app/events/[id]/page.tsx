import { redirect } from "next/navigation";

export default async function EventRoot({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/events/${(await params).id}/plan`);
}
