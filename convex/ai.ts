import { generateText, Output } from "ai";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { getModel } from "../lib/ai/provider";

/**
 * Internal (not callable from the browser): proves the configured provider,
 * model and key work and that structured output validates.
 * Run with: bunx convex run ai:healthCheck
 */
export const healthCheck = internalAction({
  args: {},
  handler: async () => {
    const { model, id, provider } = getModel();
    const started = Date.now();
    const { output } = await generateText({
      model,
      output: Output.object({ schema: z.object({ status: z.literal("ok"), echo: z.string().max(40) }) }),
      prompt: 'Reply with status "ok" and echo the word "risen".',
    });
    return { provider, model: id, ms: Date.now() - started, output };
  },
});

/** Internal: lists chat models the Groq key can use (providers retire models). */
export const listGroqModels = internalAction({
  args: {},
  handler: async () => {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    });
    if (!res.ok) throw new Error(`Groq models request failed: ${res.status}`);
    const body = (await res.json()) as { data: { id: string }[] };
    return body.data.map((m) => m.id).sort();
  },
});
