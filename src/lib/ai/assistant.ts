import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Proposal } from "@/db/schema";
import { categoryName } from "../packs";
import { aiEnabled, aiModel, anthropic } from "./client";


const PROPOSE_TOOL = {
  name: "propose_changes",
  description:
    "Propose changes to plan line amounts. The user sees them and clicks Apply. Only use item ids from the plan. Never change locked items.",
  input_schema: {
    type: "object",
    properties: {
      rationale: { type: "string" },
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: { itemId: { type: "string" }, newAmount: { type: "number" } },
          required: ["itemId", "newAmount"],
        },
      },
    },
    required: ["rationale", "changes"],
  },
};

export async function askAssistant(eventId: string, question: string) {
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, eventId),
    with: {
      plan: { with: { items: { orderBy: asc(schema.planItems.sort) } } },
      bookings: { with: { vendor: true } },
      assistant: { orderBy: asc(schema.assistantMessages.createdAt), limit: 20 },
      guests: { columns: { rsvp: true } },
    },
  });
  if (!event) throw new Error("Event not found");

  const save = async (role: "user" | "assistant", content: string, proposal: Proposal | null = null) =>
    (await db.insert(schema.assistantMessages).values({ eventId, role, content, proposal }).returning())[0];

  await save("user", question);

  if (!aiEnabled()) {
    return save(
      "assistant",
      "The AI assistant needs an Anthropic API key (ANTHROPIC_API_KEY in .env). Once it is set, I can answer questions about your plan and suggest budget changes.",
    );
  }

  const plan = event.plan;
  const confirmed = event.guests.filter((g) => g.rsvp === "YES").length;
  const context = [
    `Event: ${event.title} (${event.hostNames}), ${event.date.toISOString().slice(0, 10)}, ${event.city}, ${event.guestCount} planned guests, ${confirmed} RSVP yes so far, culture ${event.culture}, style ${event.style}.`,
    plan
      ? `Plan tier ${plan.tier}, total ₦${plan.totalBudget.toLocaleString()} incl. ${plan.contingencyPct}% contingency.\nLines:\n` +
        plan.items
          .map((i) => `- [${i.id}] ${categoryName(i.category)}: ${i.description} = ₦${i.amount.toLocaleString()}${i.locked ? " (LOCKED)" : ""}`)
          .join("\n")
      : "No plan yet.",
    event.bookings.length
      ? "Bookings:\n" +
        event.bookings
          .map((b) => `- ${b.vendor.businessName} (${categoryName(b.category)}): ${b.status}${b.quoteAmount ? `, quoted ₦${b.quoteAmount.toLocaleString()}` : ""}`)
          .join("\n")
      : "No vendor bookings yet.",
  ].join("\n\n");

  const history = event.assistant.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const res = await anthropic().messages.create({
    model: aiModel(),
    max_tokens: 1500,
    system: [
      "You are the planning assistant inside Eventa, a Nigerian event planning platform.",
      "Answer in clear, friendly English (the user may write in Nigerian Pidgin; you may reply in kind).",
      "Be honest and specific with Naira figures. If something is unrealistic, say so.",
      "When the user wants to rebalance the budget (e.g. afford something by cutting elsewhere), first explain in text, then call propose_changes with exact new amounts that keep the total sensible.",
      "Never claim to have booked, paid or contacted anyone; the user does that through the platform.",
      "",
      "Current event data:",
      context,
    ].join("\n"),
    messages: [...history, { role: "user", content: question }],
    tools: [PROPOSE_TOOL as Anthropic.Tool],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const tool = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  let proposal: Proposal | null = null;
  if (tool && plan) {
    const p = tool.input as Proposal;
    const valid = new Map(plan.items.map((i) => [i.id, i]));
    p.changes = (p.changes || []).filter((c) => valid.has(c.itemId) && !valid.get(c.itemId)!.locked && c.newAmount >= 0);
    if (p.changes.length) proposal = p;
  }

  return save("assistant", text || proposal?.rationale || "Here is a suggested change.", proposal);
}
