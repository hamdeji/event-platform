import "server-only";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import type { Event } from "@/db/schema";
import { db, schema } from "../db";
import { getPack } from "../packs";
import { aiEnabled, structuredCall } from "./client";

const ItemSchema = z.object({
  category: z.string(),
  description: z.string(),
  amount: z.number().nonnegative(),
});
const TierSchema = z.object({
  name: z.enum(["Essential", "Comfortable", "Premium"]),
  contingencyPct: z.number().min(0).max(30),
  items: z.array(ItemSchema).min(1),
});
export const PlanResultSchema = z.object({
  summary: z.string(),
  recommendedTier: z.enum(["Essential", "Comfortable", "Premium"]),
  warnings: z.array(z.string()),
  tiers: z.array(TierSchema).length(3),
  timeline: z.array(z.object({ when: z.string(), task: z.string() })),
});
export type PlanResult = z.infer<typeof PlanResultSchema> & { source: "ai" | "template" };
export type Tier = z.infer<typeof TierSchema> & { total: number };

const round = (n: number, to = 10_000) => Math.max(to, Math.round(n / to) * to);

export const tierTotal = (t: z.infer<typeof TierSchema>) => {
  const sub = t.items.reduce((s, i) => s + i.amount, 0);
  return Math.round(sub * (1 + t.contingencyPct / 100));
};

/** Average vendor starting prices on the platform, by category, for the event's city. */
async function marketSnapshot(city: string) {
  const v = schema.vendors;
  return db
    .select({
      category: v.category,
      vendors: sql<number>`count(*)::int`,
      avgFrom: sql<number>`round(avg(${v.priceFrom}))::int`,
      min: sql<number>`min(${v.priceFrom})`,
      max: sql<number>`max(${v.priceFrom})`,
    })
    .from(v)
    .where(sql`lower(${v.city}) = lower(${city})`)
    .groupBy(v.category);
}

const PLAN_TOOL = {
  name: "submit_plan",
  description: "Submit the costed event plan with three budget tiers.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "3-5 plain sentences explaining the plan and the main trade-offs." },
      recommendedTier: { type: "string", enum: ["Essential", "Comfortable", "Premium"] },
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "Honest flags: unrealistic budget vs guest count, missing must-haves, seasonal risks. Empty if none.",
      },
      tiers: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            name: { type: "string", enum: ["Essential", "Comfortable", "Premium"] },
            contingencyPct: { type: "number", description: "Usually 10-15." },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string", description: "One of the category keys provided." },
                  description: { type: "string", description: "What this line covers, specific (quantities, hours, inclusions)." },
                  amount: { type: "number", description: "Whole Naira." },
                },
                required: ["category", "description", "amount"],
              },
            },
          },
          required: ["name", "contingencyPct", "items"],
        },
      },
      timeline: {
        type: "array",
        description: "8-12 countdown tasks from now to the event day, with payment milestones.",
        items: {
          type: "object",
          properties: { when: { type: "string", description: "e.g. '6 months before'" }, task: { type: "string" } },
          required: ["when", "task"],
        },
      },
    },
    required: ["summary", "recommendedTier", "warnings", "tiers", "timeline"],
  },
};

function describeEvent(e: Event) {
  const pack = getPack(e.pack);
  const ceremonies = e.ceremonies
    .split(",")
    .map((k) => pack.ceremonies.find((c) => c.key === k)?.name ?? k)
    .join(", ");
  return [
    `Event type: ${pack.name}`,
    `Hosts: ${e.hostNames}`,
    `Date: ${e.date.toISOString().slice(0, 10)}`,
    `City: ${e.city}`,
    `Guests: ${e.guestCount}`,
    `Culture/tradition: ${e.culture}`,
    `Ceremonies: ${ceremonies}`,
    `Style: ${e.style || "not specified"}`,
    `Budget: ${e.budget ? "₦" + e.budget.toLocaleString() + " (this is the Comfortable tier target)" : "NOT SET — propose a realistic budget for their wishes"}`,
    `Must-haves: ${e.mustHaves || "none stated"}`,
    `Notes: ${e.notes || "none"}`,
  ].join("\n");
}

async function aiPlan(e: Event): Promise<PlanResult> {
  const pack = getPack(e.pack);
  const market = await marketSnapshot(e.city);
  const system = [
    `You are the senior event planner inside ${"Eventa"}, an event planning platform in Nigeria.`,
    "You build realistic, costed plans in Naira for Nigerian events. You know local customs (e.g. aso-ebi, small chops, bride price lists, owambe culture, gele) and that most couples overrun budgets by 20-40%.",
    "Rules:",
    "- Use ONLY these category keys: " + pack.categories.map((c) => `${c.key} (${c.name})`).join(", ") + ".",
    "- Skip categories that do not apply to the chosen ceremonies; split a category into several lines if helpful (e.g. CATERING for traditional and reception).",
    "- If a budget is given, the Comfortable tier's items + contingency must total within 3% of it; Essential about 70-80% of it; Premium about 130-150% of it.",
    "- If no budget is given, price what the client wants as Comfortable, and set Essential and Premium around it.",
    "- Prices must be realistic for the city in 2026. Use the reference ranges and platform vendor prices below as anchors.",
    "- Be honest in warnings: if the budget cannot deliver the guest count or must-haves, say so with numbers.",
    "",
    "Reference ranges (planning estimates):",
    ...pack.categories.map((c) => `- ${c.key}: ${c.refRange}`),
    "",
    "Vendor starting prices currently on the platform for this city:",
    market.length
      ? market.map((m) => `- ${m.category}: ${m.vendors} vendors, from ₦${m.min?.toLocaleString()} to ₦${m.max?.toLocaleString()} (avg ₦${m.avgFrom.toLocaleString()})`).join("\n")
      : "- No vendors listed for this city yet.",
  ].join("\n");

  const raw = await structuredCall<unknown>({
    system,
    messages: [{ role: "user", content: "Build the plan for this event:\n\n" + describeEvent(e) }],
    tool: PLAN_TOOL,
    maxTokens: 6000,
  });
  const parsed = PlanResultSchema.parse(raw);
  const valid = new Set(pack.categories.map((c) => c.key));
  for (const t of parsed.tiers) {
    for (const i of t.items) {
      if (!valid.has(i.category)) i.category = "OTHER";
      i.amount = round(i.amount);
    }
  }
  return { ...parsed, source: "ai" };
}

/** Deterministic fallback used when no AI key is configured or the AI call fails. */
export function templatePlan(e: Event): PlanResult {
  const pack = getPack(e.pack);
  const ceremonies = e.ceremonies.split(",");
  const perGuest = /glam|royal|owambe/i.test(e.style) ? 38_000 : /intimate|minimal/i.test(e.style) ? 26_000 : 32_000;
  const comfortable = e.budget ?? round(e.guestCount * perGuest, 100_000);
  const cats = pack.categories.filter((c) => c.key !== "TRAD_ITEMS" || ceremonies.includes("traditional"));
  const weightSum = cats.reduce((s, c) => s + c.weight, 0);

  const build = (name: "Essential" | "Comfortable" | "Premium", total: number) => {
    const contingencyPct = 10;
    const net = total / (1 + contingencyPct / 100);
    return {
      name,
      contingencyPct,
      items: cats.map((c) => ({ category: c.key, description: c.name, amount: round((net * c.weight) / weightSum) })),
    };
  };

  const warnings: string[] = [];
  if (e.budget && e.budget / e.guestCount < 15_000)
    warnings.push(
      `₦${Math.round(e.budget / e.guestCount).toLocaleString()} per guest is tight for ${e.city}. Consider fewer guests or the Essential tier.`,
    );
  warnings.push("These are template estimates. Add an AI key for a plan tailored to your wishes and city.");

  return {
    source: "template",
    summary: `A ${e.guestCount}-guest ${pack.name.toLowerCase()} in ${e.city} split across standard categories using typical Nigerian spending weights, with a 10% contingency because most couples overspend.`,
    recommendedTier: "Comfortable",
    warnings,
    tiers: [build("Essential", comfortable * 0.75), build("Comfortable", comfortable), build("Premium", comfortable * 1.4)],
    timeline: [
      { when: "9-12 months before", task: "Set budget, guest count and date; book venue (30% deposit into escrow)" },
      { when: "6-9 months before", task: "Book caterer, photographer, decorator; pay commitment deposits" },
      { when: "4-6 months before", task: "Choose aso-ebi, order attire, book makeup and MC/DJ" },
      { when: "3 months before", task: "Send invites and RSVP links; collect aso-ebi orders" },
      { when: "6 weeks before", task: "Pay pre-event milestones; confirm menu and decor details" },
      { when: "2 weeks before", task: "Finalise guest list and seating; issue QR access cards" },
      { when: "Event day", task: "Gate scanning, vendor check-ins, run of show" },
      { when: "1-3 days after", task: "Confirm delivery to release final payments; leave reviews" },
    ],
  };
}

export async function generatePlan(e: Event): Promise<PlanResult> {
  if (!aiEnabled()) return templatePlan(e);
  try {
    return await aiPlan(e);
  } catch (err) {
    console.error("AI plan failed, using template:", err);
    const t = templatePlan(e);
    t.warnings.unshift("The AI planner was unavailable, so this plan uses template estimates. Try regenerating.");
    return t;
  }
}

/** Persist a planner result as the event's plan (replacing any previous plan). */
export async function savePlan(eventId: string, r: PlanResult, tierName?: string) {
  const tier = r.tiers.find((t) => t.name === (tierName ?? r.recommendedTier)) ?? r.tiers[1];
  const tiers = r.tiers.map((t) => ({ ...t, total: tierTotal(t) }));
  return db.transaction(async (tx) => {
    await tx.delete(schema.plans).where(eq(schema.plans.eventId, eventId));
    const [plan] = await tx
      .insert(schema.plans)
      .values({
        eventId,
        tier: tier.name,
        totalBudget: tierTotal(tier),
        contingencyPct: Math.round(tier.contingencyPct),
        summary: r.summary,
        warnings: r.warnings.join("\n"),
        timeline: r.timeline,
        tiers,
        source: r.source,
      })
      .returning();
    await tx.insert(schema.planItems).values(tier.items.map((i, idx) => ({ ...i, planId: plan.id, sort: idx })));
    return plan;
  });
}

/** Switch the active plan to another proposed tier (keeps locked lines' amounts). */
export async function switchTier(eventId: string, tierName: string) {
  const plan = await db.query.plans.findFirst({ where: eq(schema.plans.eventId, eventId), with: { items: true } });
  if (!plan) throw new Error("No plan");
  const tier = plan.tiers.find((t) => t.name === tierName);
  if (!tier) throw new Error("Unknown tier");
  const locked = plan.items.filter((i) => i.locked);
  await db.transaction(async (tx) => {
    await tx.delete(schema.planItems).where(eq(schema.planItems.planId, plan.id));
    const items = tier.items.map((i, idx) => {
      const keep = locked.find((l) => l.category === i.category);
      return keep
        ? { planId: plan.id, category: keep.category, description: keep.description, amount: keep.amount, locked: true, vendorId: keep.vendorId, sort: idx }
        : { ...i, planId: plan.id, sort: idx };
    });
    await tx.insert(schema.planItems).values(items);
    const sub = items.reduce((s, i) => s + i.amount, 0);
    await tx
      .update(schema.plans)
      .set({ tier: tier.name, contingencyPct: Math.round(tier.contingencyPct), totalBudget: Math.round(sub * (1 + tier.contingencyPct / 100)) })
      .where(eq(schema.plans.id, plan.id));
  });
}

/** Recompute the plan total after line edits. */
export async function recomputePlanTotal(planId: string) {
  const plan = await db.query.plans.findFirst({ where: eq(schema.plans.id, planId), with: { items: true } });
  if (!plan) return;
  const sub = plan.items.reduce((s, i) => s + i.amount, 0);
  await db.update(schema.plans).set({ totalBudget: Math.round(sub * (1 + plan.contingencyPct / 100)) }).where(eq(schema.plans.id, planId));
}
