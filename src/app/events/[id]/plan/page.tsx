import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireEvent } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { naira } from "@/lib/format";
import { categoryName, getPack } from "@/lib/packs";
import { aiEnabled } from "@/lib/ai/client";
import { Alert, Flash, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { EventHeader } from "../EventHeader";
import {
  addItem,
  applyProposal,
  ask,
  chooseTier,
  deleteItem,
  regeneratePlan,
  setContingency,
  toggleLock,
  updateItem,
} from "@/app/actions/events";

export const metadata = { title: "Plan & budget" };

const COMMITTED = ["ACCEPTED", "CONTRACT_SIGNED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "DISPUTED"];

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { event } = await requireEvent(id);
  const [plan, bookings, chat, paidRows] = await Promise.all([
    db.query.plans.findFirst({ where: eq(schema.plans.eventId, id), with: { items: { orderBy: asc(schema.planItems.sort) } } }),
    db.query.bookings.findMany({ where: eq(schema.bookings.eventId, id), with: { vendor: true } }),
    db.query.assistantMessages.findMany({ where: eq(schema.assistantMessages.eventId, id), orderBy: asc(schema.assistantMessages.createdAt) }),
    db
      .select({ bookingId: schema.ledgerEntries.bookingId, amount: schema.ledgerEntries.amount, debit: schema.ledgerEntries.debit, credit: schema.ledgerEntries.credit })
      .from(schema.ledgerEntries)
      .innerJoin(schema.bookings, eq(schema.bookings.id, schema.ledgerEntries.bookingId))
      .where(eq(schema.bookings.eventId, id)),
  ]);
  const pack = getPack(event.pack);

  const committedBy = new Map<string, number>();
  const paidBy = new Map<string, number>();
  for (const b of bookings) {
    if (COMMITTED.includes(b.status) && b.quoteAmount) committedBy.set(b.category, (committedBy.get(b.category) ?? 0) + b.quoteAmount);
    const paid = paidRows.filter((r) => r.bookingId === b.id && r.debit === "CLIENT" && r.credit === "ESCROW").reduce((s, r) => s + r.amount, 0);
    paidBy.set(b.category, (paidBy.get(b.category) ?? 0) + paid);
  }
  const totalCommitted = [...committedBy.values()].reduce((a, b) => a + b, 0);
  const totalPaid = [...paidBy.values()].reduce((a, b) => a + b, 0);

  if (!plan)
    return (
      <div className="space-y-5">
        <EventHeader event={event} active="plan" />
        <form action={regeneratePlan.bind(null, id)} className="card">
          <p>No plan yet.</p>
          <SubmitButton className="btn-gold mt-3" pendingText="Building…">Generate plan</SubmitButton>
        </form>
      </div>
    );

  const subtotal = plan.items.reduce((s, i) => s + i.amount, 0);
  const contingency = plan.totalBudget - subtotal;
  const perGuest = Math.round(plan.totalBudget / event.guestCount);

  return (
    <div className="space-y-6">
      <EventHeader event={event} active="plan" />
      <Flash sp={sp} />

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label={`${plan.tier} budget`} value={naira(plan.totalBudget)} sub={`${naira(perGuest)} per guest`} />
        <Stat label="Committed to vendors" value={naira(totalCommitted)} sub={`${Math.round((totalCommitted / plan.totalBudget) * 100)}% of budget`} />
        <Stat label="Paid into escrow" value={naira(totalPaid)} />
        <Stat label="Your target" value={event.budget ? naira(event.budget) : "Not set"} sub={event.budget ? (plan.totalBudget > event.budget ? `${naira(plan.totalBudget - event.budget)} over` : "On target") : "Planner proposed this budget"} />
      </div>

      {plan.source === "template" && (
        <Alert kind="warn">
          This plan uses template estimates{aiEnabled() ? " because the AI call failed. Try regenerating." : ". Add an ANTHROPIC_API_KEY to get an AI-tailored plan."}
        </Alert>
      )}

      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="h2">Planner summary</h2>
            <p className="mt-1 text-sm text-stone-700">{plan.summary}</p>
          </div>
          <form action={regeneratePlan.bind(null, id)}>
            <SubmitButton className="btn-outline btn-sm whitespace-nowrap" pendingText="Rebuilding…" confirm="Rebuild the plan from scratch? Your edits will be replaced.">
              ↻ Rebuild plan
            </SubmitButton>
          </form>
        </div>
        {plan.warnings && (
          <ul className="space-y-1">
            {plan.warnings.split("\n").filter(Boolean).map((w, i) => (
              <li key={i} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">⚠ {w}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {plan.tiers.map((t) => (
          <form key={t.name} action={chooseTier.bind(null, id, t.name)} className={`card ${plan.tier === t.name ? "border-2 border-brand-700" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="font-semibold">{t.name}</div>
              {plan.tier === t.name ? <span className="badge bg-brand-700 text-white">Current</span> : null}
            </div>
            <div className="mt-1 text-2xl font-bold">{naira(t.total)}</div>
            <div className="muted">{t.items.length} lines · {t.contingencyPct}% contingency</div>
            {plan.tier !== t.name && (
              <SubmitButton className="btn-outline btn-sm mt-3" pendingText="Switching…">Switch to {t.name}</SubmitButton>
            )}
          </form>
        ))}
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="h2">Budget lines</h2>
          <span className="muted">Lock a line to keep it when switching tiers or applying AI suggestions.</span>
        </div>
        <table className="table mt-3">
          <thead>
            <tr>
              <th>Category</th>
              <th>What it covers</th>
              <th className="text-right">Planned</th>
              <th className="text-right">Committed</th>
              <th className="text-right">Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {plan.items.map((i) => {
              const committed = committedBy.get(i.category) ?? 0;
              const over = committed > i.amount;
              return (
                <tr key={i.id}>
                  <td className="font-medium whitespace-nowrap">{categoryName(i.category, event.pack)}</td>
                  <td className="w-full">
                    <form action={updateItem.bind(null, i.id)} className="flex gap-2">
                      <input className="input py-1" name="description" defaultValue={i.description} />
                      <input className="input w-36 py-1 text-right" name="amount" defaultValue={i.amount.toLocaleString()} inputMode="numeric" />
                      <button className="btn-outline btn-sm">Save</button>
                    </form>
                  </td>
                  <td className="text-right font-semibold whitespace-nowrap">{naira(i.amount)}</td>
                  <td className={`text-right whitespace-nowrap ${over ? "font-semibold text-red-700" : ""}`}>{committed ? naira(committed) : "—"}</td>
                  <td className="text-right whitespace-nowrap">{paidBy.get(i.category) ? naira(paidBy.get(i.category)) : "—"}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex gap-1">
                      <form action={toggleLock.bind(null, i.id)}>
                        <button className="btn-outline btn-sm" title={i.locked ? "Unlock" : "Lock"}>{i.locked ? "🔒" : "🔓"}</button>
                      </form>
                      <Link href={`/events/${id}/vendors?category=${i.category}&budget=${i.amount}`} className="btn-primary btn-sm">Find vendors</Link>
                      <form action={deleteItem.bind(null, i.id)}>
                        <SubmitButton className="btn-danger btn-sm" confirm="Remove this line?">✕</SubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-stone-50">
              <td className="font-medium">Contingency</td>
              <td>
                <form action={setContingency.bind(null, id)} className="flex items-center gap-2 text-sm">
                  <input className="input w-20 py-1 text-right" name="pct" defaultValue={plan.contingencyPct} inputMode="numeric" />% buffer for overruns
                  <button className="btn-outline btn-sm">Save</button>
                </form>
              </td>
              <td className="text-right font-semibold">{naira(contingency)}</td>
              <td colSpan={3}></td>
            </tr>
            <tr>
              <td className="font-bold">Total</td>
              <td></td>
              <td className="text-right text-lg font-bold">{naira(plan.totalBudget)}</td>
              <td className="text-right font-semibold">{naira(totalCommitted)}</td>
              <td className="text-right font-semibold">{naira(totalPaid)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <form action={addItem.bind(null, id)} className="flex flex-wrap gap-2 border-t border-stone-100 p-4">
          <select className="input w-56" name="category">
            {pack.categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            <option value="OTHER">Other</option>
          </select>
          <input className="input flex-1" name="description" placeholder="e.g. Aso-ebi for bridal train" />
          <input className="input w-40" name="amount" placeholder="Amount ₦" inputMode="numeric" />
          <button className="btn-outline">+ Add line</button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card lg:col-span-2">
          <h2 className="h2">Countdown checklist</h2>
          <ol className="mt-3 space-y-3">
            {plan.timeline.map((t, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-32 shrink-0 font-semibold text-brand-700">{t.when}</span>
                <span>{t.task}</span>
              </li>
            ))}
          </ol>
        </div>

        <div id="assistant" className="card flex flex-col lg:col-span-3">
          <h2 className="h2">Ask the planner</h2>
          <p className="muted">E.g. &quot;Can I afford a live band if I cut souvenirs?&quot; or &quot;What if we invite 400 people?&quot;</p>
          <div className="mt-3 max-h-[28rem] flex-1 space-y-3 overflow-y-auto">
            {chat.map((m) => (
              <div key={m.id} className={m.role === "user" ? "ml-10 rounded-lg bg-brand-50 p-3 text-sm" : "mr-10 rounded-lg bg-stone-100 p-3 text-sm"}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.proposal && (
                  <div className="mt-3 rounded-md border border-stone-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase text-stone-500">Suggested changes</div>
                    <ul className="mt-1 space-y-1">
                      {m.proposal.changes.map((c) => {
                        const item = plan.items.find((x) => x.id === c.itemId);
                        return (
                          <li key={c.itemId}>
                            {item ? categoryName(item.category) : "Removed line"}: {item ? naira(item.amount) : ""} → <b>{naira(c.newAmount)}</b>
                          </li>
                        );
                      })}
                    </ul>
                    {m.applied ? (
                      <div className="mt-2 text-xs font-semibold text-emerald-700">✓ Applied</div>
                    ) : (
                      <form action={applyProposal.bind(null, id, m.id)}>
                        <SubmitButton className="btn-primary btn-sm mt-2">Apply changes</SubmitButton>
                      </form>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <form action={ask.bind(null, id)} className="mt-3 flex gap-2">
            <input className="input" name="question" placeholder="Ask about your budget, vendors or timeline…" required />
            <SubmitButton pendingText="Thinking…">Ask</SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
