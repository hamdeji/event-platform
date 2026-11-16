import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

export const aiModel = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

let client: Anthropic | null = null;
export function anthropic() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

/**
 * Ask Claude for structured output by forcing a single tool call and returning its input.
 */
export async function structuredCall<T>(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  tool: Tool;
  maxTokens?: number;
}): Promise<T> {
  const res = await anthropic().messages.create({
    model: aiModel(),
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    messages: opts.messages,
    tools: [opts.tool as Anthropic.Tool],
    tool_choice: { type: "tool", name: opts.tool.name },
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("AI did not return structured output");
  return block.input as T;
}
