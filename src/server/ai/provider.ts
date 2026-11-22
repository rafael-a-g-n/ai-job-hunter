import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { env } from "@/lib/env";
import { mockModel, type MockKey } from "./mock";
import { modelIdFor, type ModelTier } from "./models";

/** The model for the env-selected provider (`AI_PROVIDER`). */
export function getModel(tier: ModelTier, mockKey: MockKey): LanguageModelV4 {
  if (env.AI_PROVIDER === "mock") return mockModel(mockKey);
  const id = modelIdFor(tier);
  if (env.AI_PROVIDER === "google") {
    return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(id);
  }
  return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(id);
}
