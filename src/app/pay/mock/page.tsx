import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { naira } from "@/lib/format";
import { Alert } from "@/components/ui";

export const metadata = { title: "Test checkout" };

/** Stand-in for the PSP checkout page when PAYMENT_PROVIDER=mock. */
export default async function MockPay({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const m = ref ? await db.query.milestones.findFirst({ where: eq(schema.milestones.paymentRef, ref), with: { booking: { with: { vendor: true } } } }) : null;
  if (!m) return <Alert kind="error">Unknown payment reference.</Alert>;
  return (
    <div className="mx-auto max-w-md space-y-4 py-10">
      <Alert kind="warn">Test mode: no real money moves. Set PAYMENT_PROVIDER=paystack for real checkout.</Alert>
      <div className="card space-y-3">
        <div className="muted">Pay to escrow for</div>
        <div className="h2">{m.booking.vendor.businessName}: {m.label}</div>
        <div className="flex justify-between text-sm"><span>Milestone</span><span>{naira(m.amount)}</span></div>
        <div className="flex justify-between text-sm"><span>Escrow protection fee</span><span>{naira(m.clientFee)}</span></div>
        <div className="flex justify-between border-t pt-2 font-bold"><span>Total</span><span>{naira(m.amount + m.clientFee)}</span></div>
        <div className="text-xs text-stone-500">Ref {m.paymentRef}</div>
        <form action="/api/payments/mock-confirm" method="post" className="space-y-2">
          <input type="hidden" name="ref" value={m.paymentRef!} />
          <button className="btn-gold w-full">Pay with bank transfer (test)</button>
        </form>
        <a href={`/bookings/${m.bookingId}?error=Payment cancelled`} className="btn-outline w-full">Cancel</a>
      </div>
    </div>
  );
}
