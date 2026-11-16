import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { categoryName } from "@/lib/packs";
import { fmtDate, fmtDateTime, naira } from "@/lib/format";
import { ECON } from "@/lib/config";
import { clientFeeFor } from "@/lib/escrow";
import { Alert, Flash, StatusBadge, TierBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  acceptQuote,
  clientRelease,
  declineBooking,
  dispute,
  leaveReview,
  payMilestone,
  replyToReview,
  requestSignOtp,
  sendMessage,
  sendQuote,
  signContract,
  togglePin,
  vendorDelivered,
} from "@/app/actions/bookings";

export const metadata = { title: "Booking" };

const STEPS = ["REQUESTED", "QUOTED", "ACCEPTED", "CONTRACT_SIGNED", "IN_PROGRESS", "DELIVERED", "COMPLETED"];

export default async function BookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const b = await db.query.bookings.findFirst({
    where: eq(schema.bookings.id, id),
    with: {
      vendor: { with: { user: true } },
      client: true,
      event: true,
      contract: true,
      review: true,
      milestones: { orderBy: asc(schema.milestones.sort) },
      messages: { orderBy: asc(schema.messages.createdAt), with: { sender: { columns: { name: true, id: true } } } },
      disputes: true,
    },
  });
  if (!b) redirect("/dashboard");
  const isClient = b.clientId === user.id;
  const isVendor = b.vendor.userId === user.id;
  const isAdmin = user.role === "ADMIN";
  if (!isClient && !isVendor && !isAdmin) redirect("/dashboard");

  const funded = b.milestones.some((m) => m.status !== "PENDING");
  const stepIdx = STEPS.indexOf(b.status);
  const c = b.contract;
  const mySigned = c && (isClient ? c.clientSignedAt : isVendor ? c.vendorSignedAt : null);
  const held = b.milestones.filter((m) => ["FUNDED", "RELEASE_REQUESTED", "DISPUTED"].includes(m.status)).reduce((s, m) => s + m.amount, 0);
  const released = b.milestones.filter((m) => m.status === "RELEASED").reduce((s, m) => s + m.amount, 0);
  const canEditQuote = isVendor && ["REQUESTED", "QUOTED"].includes(b.status);
  const eventSoon = b.event.date.getTime() <= Date.now() + 86_400_000;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={isVendor ? "/vendor" : `/events/${b.eventId}/vendors`} className="text-sm text-brand-700">← Back</Link>
          <h1 className="h1">{categoryName(b.category)}: {b.vendor.businessName}</h1>
          <p className="muted">
            {b.event.title} · {fmtDate(b.event.date)} · {b.event.city} · {b.event.guestCount} guests
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TierBadge tier={b.vendor.tier} />
          <StatusBadge status={b.status} />
        </div>
      </div>
      <Flash sp={sp} />

      {stepIdx >= 0 && (
        <div className="flex flex-wrap gap-1 text-xs">
          {STEPS.map((s, i) => (
            <span key={s} className={`rounded-full px-3 py-1 ${i <= stepIdx ? "bg-brand-700 text-white" : "bg-stone-200 text-stone-500"}`}>
              {i + 1}. {s.replace("_", " ").toLowerCase()}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Left: actions */}
        <div className="space-y-5 lg:col-span-3">
          {/* Quote */}
          <section className="card">
            <h2 className="h2">Quote</h2>
            <p className="mt-1 text-sm text-stone-600"><b>Client brief:</b> {b.brief}</p>
            {b.quoteAmount ? (
              <div className="mt-3 rounded-lg bg-stone-50 p-4">
                <div className="text-2xl font-bold">{naira(b.quoteAmount)}</div>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {(b.quoteDetails ?? "").split("\n").filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}
                </ul>
                {isClient && (
                  <p className="mt-2 text-xs text-stone-500">
                    You also pay a {ECON.clientFeePct}% escrow protection fee per payment ({naira(clientFeeFor(b.quoteAmount))} in total).
                  </p>
                )}
              </div>
            ) : (
              <p className="muted mt-3">Waiting for the vendor to send a quote.</p>
            )}

            {canEditQuote && (
              <form action={sendQuote.bind(null, b.id)} className="mt-4 space-y-3 border-t border-stone-100 pt-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="label">Total price (₦)</label>
                    <input className="input" name="amount" inputMode="numeric" defaultValue={b.quoteAmount?.toLocaleString()} required />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Deliverables (one per line, these go into the contract)</label>
                    <textarea className="input" name="details" rows={4} defaultValue={b.quoteDetails ?? ""} placeholder={"300 plates: jollof, fried rice, 2 proteins\n6 uniformed servers\nService 4pm–8pm"} required />
                  </div>
                </div>
                <p className="text-xs text-stone-500">Platform commission: {b.commissionPct}% of each released payment.</p>
                <div className="flex gap-2">
                  <SubmitButton>{b.quoteAmount ? "Update quote" : "Send quote"}</SubmitButton>
                </div>
              </form>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {isClient && b.status === "QUOTED" && (
                <form action={acceptQuote.bind(null, b.id)}>
                  <SubmitButton className="btn-gold">Accept quote & create contract</SubmitButton>
                </form>
              )}
              {(isClient || isVendor) && ["REQUESTED", "QUOTED"].includes(b.status) && (
                <form action={declineBooking.bind(null, b.id)}>
                  <SubmitButton className="btn-danger" confirm="Are you sure?">{isVendor ? "Decline request" : "Withdraw request"}</SubmitButton>
                </form>
              )}
            </div>
          </section>

          {/* Contract */}
          {c && (
            <section id="contract" className="card">
              <div className="flex items-center justify-between">
                <h2 className="h2">Contract (v{c.version})</h2>
                <Link href={`/contracts/${b.id}`} className="btn-outline btn-sm" target="_blank">View / print</Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-stone-200 p-3">
                  <div className="muted">Client</div>
                  {c.clientSignedAt ? <div className="font-semibold text-emerald-700">✓ Signed {fmtDateTime(c.clientSignedAt)}</div> : <div className="text-amber-700">Awaiting signature</div>}
                </div>
                <div className="rounded-lg border border-stone-200 p-3">
                  <div className="muted">Vendor</div>
                  {c.vendorSignedAt ? <div className="font-semibold text-emerald-700">✓ Signed {fmtDateTime(c.vendorSignedAt)}</div> : <div className="text-amber-700">Awaiting signature</div>}
                </div>
              </div>
              <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-sans text-xs text-stone-700">{c.body}</pre>
              <div className="mt-1 text-[10px] text-stone-400">SHA-256 {c.bodyHash}</div>
              {(isClient || isVendor) && !mySigned && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <form action={requestSignOtp.bind(null, b.id)}>
                    <SubmitButton className="btn-outline">1. Send me a signing code</SubmitButton>
                  </form>
                  <form action={signContract.bind(null, b.id)} className="flex gap-2">
                    <input className="input w-36" name="otp" placeholder="6-digit code" inputMode="numeric" required />
                    <SubmitButton>2. Sign contract</SubmitButton>
                  </form>
                </div>
              )}
            </section>
          )}

          {/* Escrow */}
          {b.milestones.length > 0 && (
            <section className="card">
              <div className="flex items-center justify-between">
                <h2 className="h2">Escrow payments</h2>
                <div className="text-sm text-stone-600">Held: <b>{naira(held)}</b> · Released: <b>{naira(released)}</b></div>
              </div>
              {b.status === "ACCEPTED" && <Alert kind="info">Both parties need to sign the contract before payments open.</Alert>}
              <div className="mt-3 space-y-3">
                {b.milestones.map((m) => {
                  const openDispute = b.disputes.find((d) => d.milestoneId === m.id && d.status === "OPEN");
                  const isHeld = ["FUNDED", "RELEASE_REQUESTED"].includes(m.status);
                  const canPay = isClient && m.status === "PENDING" && ["CONTRACT_SIGNED", "IN_PROGRESS", "DELIVERED"].includes(b.status);
                  const canRelease = (isClient || isAdmin) && isHeld && (m.earlyRelease || b.status === "DELIVERED");
                  return (
                    <div key={m.id} className="rounded-lg border border-stone-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold">{m.label} · {m.percent}%</div>
                          <div className="text-sm text-stone-600">{naira(m.amount)}{m.earlyRelease ? " · can be released before the event for materials" : ""}</div>
                          {m.status === "RELEASE_REQUESTED" && m.releaseAfter && (
                            <div className="text-xs text-amber-700">Auto-releases {fmtDateTime(m.releaseAfter)} unless disputed</div>
                          )}
                        </div>
                        <StatusBadge status={m.status} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canPay && (
                          <form action={payMilestone.bind(null, b.id, m.id)}>
                            <SubmitButton className="btn-gold" pendingText="Opening checkout…">
                              Pay {naira(m.amount + clientFeeFor(m.amount))} into escrow
                            </SubmitButton>
                          </form>
                        )}
                        {canRelease && (
                          <form action={clientRelease.bind(null, b.id, m.id)}>
                            <SubmitButton className="btn-primary" confirm={`Release ${naira(m.amount)} to the vendor? This cannot be undone.`}>
                              {b.status === "DELIVERED" ? "Confirm delivery & release" : "Release deposit early"}
                            </SubmitButton>
                          </form>
                        )}
                        {(isClient || isVendor) && isHeld && !openDispute && (
                          <details className="w-full">
                            <summary className="cursor-pointer text-sm text-red-700">Open a dispute on this payment</summary>
                            <form action={dispute.bind(null, b.id, m.id)} className="mt-2 flex gap-2">
                              <input className="input" name="reason" placeholder="What went wrong? Be specific." required />
                              <SubmitButton className="btn-danger">Open dispute</SubmitButton>
                            </form>
                          </details>
                        )}
                        {openDispute && <Alert kind="error">Dispute open: {openDispute.reason}. A mediator will review the evidence.</Alert>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {isVendor && ["IN_PROGRESS", "CONTRACT_SIGNED"].includes(b.status) && (
                <form action={vendorDelivered.bind(null, b.id)} className="mt-4">
                  <SubmitButton className="btn-primary" disabled={!eventSoon} confirm="Confirm the service has been delivered as contracted?">
                    Mark service delivered
                  </SubmitButton>
                  {!eventSoon && <span className="ml-2 text-xs text-stone-500">Available from the event day.</span>}
                </form>
              )}
            </section>
          )}

          {/* Review */}
          {b.status === "COMPLETED" && (
            <section className="card">
              <h2 className="h2">Review</h2>
              {b.review ? (
                <div className="mt-2 text-sm">
                  <div>Punctuality {b.review.punctuality}/5 · Quality {b.review.quality}/5 · Communication {b.review.communication}/5 · Value {b.review.value}/5</div>
                  <p className="mt-1">{b.review.comment}</p>
                  {b.review.vendorReply && <p className="mt-2 rounded bg-stone-50 p-2">Vendor reply: {b.review.vendorReply}</p>}
                  {isVendor && !b.review.vendorReply && (
                    <form action={replyToReview.bind(null, b.id)} className="mt-2 flex gap-2">
                      <input className="input" name="reply" placeholder="Reply publicly (once)" required />
                      <SubmitButton>Reply</SubmitButton>
                    </form>
                  )}
                </div>
              ) : isClient ? (
                <form action={leaveReview.bind(null, b.id)} className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {["punctuality", "quality", "communication", "value"].map((k) => (
                      <div key={k}>
                        <label className="label capitalize">{k}</label>
                        <select className="input" name={k} defaultValue="5">
                          {[5, 4, 3, 2, 1].map((n) => <option key={n}>{n}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <textarea className="input" name="comment" rows={3} placeholder="How did it go?" required />
                  <SubmitButton>Submit review</SubmitButton>
                </form>
              ) : (
                <p className="muted mt-2">The client has not reviewed yet.</p>
              )}
            </section>
          )}
        </div>

        {/* Right: chat */}
        <section className="card flex flex-col lg:col-span-2">
          <h2 className="h2">Messages</h2>
          <div className="muted">
            {isClient ? b.vendor.businessName : b.client.name}
            {funded ? ` · ${isClient ? b.vendor.user.phone ?? "" : b.client.phone ?? ""}` : " · phone shared once a payment is in escrow"}
          </div>
          <div className="mt-3 max-h-[36rem] flex-1 space-y-2 overflow-y-auto">
            {b.messages.map((m) =>
              m.system ? (
                <div key={m.id} className="whitespace-pre-wrap rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-600">{m.body}</div>
              ) : (
                <div key={m.id} className={`rounded-lg p-3 text-sm ${m.senderId === user.id ? "ml-6 bg-brand-50" : "mr-6 bg-stone-100"}`}>
                  <div className="flex justify-between text-xs text-stone-500">
                    <span>{m.sender.name}</span>
                    <span>{fmtDateTime(m.createdAt)}</span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
                  {(isClient || isVendor) && !c?.clientSignedAt && !c?.vendorSignedAt && (
                    <form action={togglePin.bind(null, b.id, m.id)}>
                      <button className="mt-1 text-xs text-brand-700">{m.pinned ? "📌 Pinned to contract · unpin" : "Pin to contract"}</button>
                    </form>
                  )}
                  {m.pinned && (c?.clientSignedAt || c?.vendorSignedAt) && <div className="mt-1 text-xs text-brand-700">📌 In contract</div>}
                </div>
              ),
            )}
          </div>
          {(isClient || isVendor) && (
            <form action={sendMessage.bind(null, b.id)} className="mt-3 flex gap-2">
              <input className="input" name="body" placeholder="Write a message…" required />
              <SubmitButton>Send</SubmitButton>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
