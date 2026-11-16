import { NextResponse } from "next/server";
import { payments } from "@/lib/payments/provider";
import { confirmMilestonePayment } from "@/lib/escrow";

/** Paystack webhook: the reliable source of payment confirmation (callback may never fire). */
export async function POST(req: Request) {
  const raw = await req.text();
  const p = payments();
  if (!p.verifyWebhook?.(raw, req.headers.get("x-paystack-signature"))) return NextResponse.json({ ok: false }, { status: 401 });
  const evt = JSON.parse(raw);
  if (evt.event === "charge.success") {
    try {
      await confirmMilestonePayment(evt.data.reference, Math.round(evt.data.amount / 100));
    } catch (e) {
      console.error("webhook confirm failed", e);
    }
  }
  return NextResponse.json({ ok: true });
}
