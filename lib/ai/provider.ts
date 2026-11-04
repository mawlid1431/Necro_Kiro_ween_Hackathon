import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// Provider switch (docs section 9.1). Runs only inside Convex actions, so the
// keys are read from Convex environment variables and never reach the browser.
export type AiProvider = "bedrock" | "openai" | "groq";

export function getModel(): { model: LanguageModel; id: string; provider: AiProvider } {
  const provider = process.env.AI_PROVIDER as AiProvider | undefined;
  const id = process.env.AI_MODEL;
  if (!id) throw new Error("Set AI_MODEL in the Convex environment variables");

  switch (provider) {
    case "groq":
      return { model: createGroq({ apiKey: process.env.GROQ_API_KEY })(id), id, provider };
    case "openai":
      return { model: createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(id), id, provider };
    case "bedrock":
      return { model: createAmazonBedrock({ region: process.env.AWS_REGION })(id), id, provider };
    default:
      throw new Error("Set AI_PROVIDER to bedrock, openai or groq");
  }
}
