import { createEvent } from "@/app/actions/events";
import { requireUser } from "@/lib/auth";
import { getPack } from "@/lib/packs";
import { aiEnabled } from "@/lib/ai/client";
import { Alert, Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Plan a new event" };

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser(["CLIENT", "ADMIN"]);
  const sp = await searchParams;
  const pack = getPack("wedding");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="h1">Tell us about your wedding</h1>
        <p className="muted">Takes about 3 minutes. Have a budget? Enter it. Not sure? Leave it blank and the planner will propose one.</p>
      </div>
      <Flash sp={sp} />
      {!aiEnabled() && <Alert kind="warn">AI key not configured. You&apos;ll get a template-based plan. Add ANTHROPIC_API_KEY to enable the AI planner.</Alert>}
      <form action={createEvent} className="space-y-5">
        <input type="hidden" name="pack" value="wedding" />
        <section className="card grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Couple&apos;s names</label>
            <input className="input" name="hostNames" placeholder="Tolu & Chidi" required />
          </div>
          <div>
            <label className="label">Event title (optional)</label>
            <input className="input" name="title" placeholder="#TC2027" />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" name="date" type="date" required />
          </div>
          <div>
            <label className="label">City</label>
            <select className="input" name="city" defaultValue="Lagos">
              {["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Enugu", "Benin City", "Kano", "Kaduna", "Uyo", "Owerri", "Abeokuta", "Warri"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Expected guests</label>
            <input className="input" name="guestCount" inputMode="numeric" placeholder="300" required />
          </div>
          <div>
            <label className="label">Budget in ₦ (leave blank if undecided)</label>
            <input className="input" name="budget" inputMode="numeric" placeholder="e.g. 8,000,000" />
          </div>
        </section>

        <section className="card space-y-4">
          <div>
            <div className="label">Which ceremonies are you planning?</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {pack.ceremonies.map((c) => (
                <label key={c.key} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
                  <input type="checkbox" name={`c_${c.key}`} defaultChecked={["traditional", "church", "reception"].includes(c.key)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Culture / tradition</label>
              <select className="input" name="culture">
                {pack.cultures.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Style</label>
              <select className="input" name="style">
                {pack.styles.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Must-haves</label>
            <input className="input" name="mustHaves" placeholder="Live band, drone shots, small chops at the traditional…" />
          </div>
          <div>
            <label className="label">Anything else the planner should know?</label>
            <textarea className="input" name="notes" rows={3} placeholder="Families are paying for the traditional; we want to keep the reception under ₦5m…" />
          </div>
        </section>
        <SubmitButton className="btn-gold w-full py-3 text-base" pendingText="Building your plan… (up to a minute)">
          Build my plan
        </SubmitButton>
      </form>
    </div>
  );
}
