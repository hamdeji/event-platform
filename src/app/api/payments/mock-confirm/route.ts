import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { confirmMilestonePayment } from "@/lib/escrow";
import { APP_URL } from "@/lib/config";

export async function POST(req: Request) {
  if (process.env.PAYMENT_PROVIDER === "paystack") return NextResponse.json({ error: "Mock payments are disabled" }, { status: 403 });
  const ref = String((await req.formData()).get("ref") ?? "");
  const m = await db.query.milestones.findFirst({ where: eq(schema.milestones.paymentRef, ref) });
  if (!m) return NextResponse.redirect(`${APP_URL}/dashboard`, 303);
  await confirmMilestonePayment(ref);
  return NextResponse.redirect(`${APP_URL}/bookings/${m.bookingId}?ok=${encodeURIComponent("Payment received and held in escrow.")}`, 303);
}
