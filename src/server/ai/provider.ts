import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { env } from "@/lib/env";
import { mockModel, type MockKey } from "./mock";
import { MODELS, type ModelTier } from "./models";

/** The model for the env-selected provider (`AI_PROVIDER`). */
export function getModel(tier: ModelTier, mockKey: MockKey): LanguageModelV4 {
  if (env.AI_PROVIDER === "mock") return mockModel(mockKey);
  const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropic(MODELS[tier]);
}
