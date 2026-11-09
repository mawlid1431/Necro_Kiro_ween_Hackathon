"use node";
// Glue between the pure AI router and Convex: breaker state and budgets live in the
// database, and structured output gets one repair attempt before the next rung.
// Import only from "use node" actions (it pulls in the AI SDK).
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { ZodError, type z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveRung, type Rung } from "../../lib/ai/providers";
import type { Id } from "../_generated/dataModel";
import { chainFor, RUNG_TIMEOUT_MS, runWithLadder, type AiTask, type RouterDeps } from "../../lib/ai/router";

export function convexDeps(ctx: ActionCtx): RouterDeps {
  return {
    resolve: resolveRung,
    isOpen: (provider) => ctx.runQuery(internal.providerHealth.isOpen, { provider }),
    reserveBudget: (provider) => ctx.runMutation(internal.providerHealth.reserveBudget, { provider }),
    recordResult: async (provider, ok, status, retryAfterMs) => {
      await ctx.runMutation(internal.providerHealth.recordResult, { provider, ok, status, retryAfterMs });
    },
    // Only task, model, rung, latency and status. Never prompts, article text or outputs.
    log: (line) => console.log(JSON.stringify(line)),
  };
}

export interface StructuredResult<T> {
  output: T;
  inputTokens: number;
  outputTokens: number;
}

const REASONING_HEADROOM = 1024;

/**
 * One rung: structured output validated by Zod. If the model's JSON does not match,
 * send one short repair turn on the same rung with the Zod issues, then give up (next rung).
 */
async function structuredCall<S extends z.ZodType>(
  rung: Rung,
  p: { system: string; prompt: string; schema: S; maxOutputTokens: number },
): Promise<StructuredResult<z.infer<S>>> {
  const base = {
    model: rung.model,
    system: p.system,
    output: Output.object({ schema: p.schema }),
    // Reasoning models (e.g. gpt-oss on Groq) spend hidden reasoning tokens before the JSON.
    // Without headroom the cap is used up first, the answer is empty and Groq returns
    // 400 json_validate_failed. `p.maxOutputTokens` is the size of the answer itself.
    maxOutputTokens: p.maxOutputTokens + REASONING_HEADROOM,
    providerOptions: { groq: { reasoningEffort: "low" } }, // other providers ignore it
    maxRetries: 0, // the ladder retries, not the SDK
  };
  try {
    const r = await generateText({ ...base, prompt: p.prompt, abortSignal: AbortSignal.timeout(RUNG_TIMEOUT_MS) });
    // parse() re-checks with our own Zod schema and gives the output its static type.
    return { output: p.schema.parse(r.output), inputTokens: r.usage.inputTokens ?? 0, outputTokens: r.usage.outputTokens ?? 0 };
  } catch (e) {
    if (e instanceof ZodError) throw new Error("schema"); // bad JSON shape: the model's fault, not the provider's health
    if (!NoObjectGeneratedError.isInstance(e)) throw e;
    const issues = e.cause instanceof Error ? e.cause.message.slice(0, 600) : "it was not valid JSON";
    const r = await generateText({
      ...base,
      messages: [
        { role: "user", content: p.prompt },
        { role: "assistant", content: (e.text ?? "").slice(0, 4000) },
        { role: "user", content: `Your last answer did not match the schema: ${issues}. Return only valid JSON.` },
      ],
      abortSignal: AbortSignal.timeout(RUNG_TIMEOUT_MS),
    }).catch((err: unknown) => {
      // The repair also failed to produce valid JSON: still a schema miss, so the breaker is not tripped.
      throw NoObjectGeneratedError.isInstance(err) ? new Error("schema") : err;
    });
    const parsed = p.schema.safeParse(r.output);
    if (!parsed.success) throw new Error("schema");
    return { output: parsed.data, inputTokens: r.usage.inputTokens ?? 0, outputTokens: r.usage.outputTokens ?? 0 };
  }
}

/**
 * Runs a structured task down its ladder for one user. Throws AllRungsFailed when the caller should use Ghost mode.
 * `userId` is required so every AI call honours that user's Private mode.
 */
export async function ladderObject<S extends z.ZodType>(
  ctx: ActionCtx,
  task: AiTask,
  p: { system: string; prompt: string; schema: S; maxOutputTokens: number },
  who: { userId: Id<"users"> },
) {
  const forcePrivate = await ctx.runQuery(internal.users.privateModeOf, { userId: who.userId });
  return await runWithLadder(
    task,
    convexDeps(ctx),
    (rung) => structuredCall(rung, p),
    (r) => p.schema.safeParse(r.output).success,
    undefined,
    chainFor(task),
    forcePrivate,
  );
}
