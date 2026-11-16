import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { payments } from "@/lib/payments/provider";
import { confirmMilestonePayment } from "@/lib/escrow";
import { APP_URL } from "@/lib/config";

/** Customer is redirected here by the PSP after checkout. Always verify server-side. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ref = url.searchParams.get("reference") || url.searchParams.get("trxref") || "";
  const m = await db.query.milestones.findFirst({ where: eq(schema.milestones.paymentRef, ref) });
  if (!m) return NextResponse.redirect(`${APP_URL}/dashboard`);
  try {
    const v = await payments().verify(ref);
    if (!v.paid) return NextResponse.redirect(`${APP_URL}/bookings/${m.bookingId}?error=${encodeURIComponent("Payment was not completed.")}`);
    await confirmMilestonePayment(ref, v.amountNaira);
    return NextResponse.redirect(`${APP_URL}/bookings/${m.bookingId}?ok=${encodeURIComponent("Payment received and held in escrow.")}`);
  } catch (e) {
    return NextResponse.redirect(`${APP_URL}/bookings/${m.bookingId}?error=${encodeURIComponent((e as Error).message)}`);
  }
}
