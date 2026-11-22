import { env } from "@/lib/env";

/**
 * Model ids per provider. The mock provider reports the Anthropic ids, so recorded AiCall rows
 * look the same as before. Google ids are on the Gemini API free tier (checked 2026-11-22,
 * https://ai.google.dev/gemini-api/docs/pricing): the `fast` tier (a Flash-Lite model) serves
 * the CV analysis, job normalising and re-ranking; only the cover letters use `strong` (a Flash
 * model).
 */
export const MODELS = {
  anthropic: { fast: "claude-haiku-5-5", strong: "claude-sonnet-5-5" },
  google: { fast: "gemini-3.5-flash-lite", strong: "gemini-3.6-flash" },
} as const;

export type ModelTier = keyof (typeof MODELS)["anthropic"];
export type ModelId = (typeof MODELS)[keyof typeof MODELS][ModelTier];

/** The real model id of a tier for the env-selected provider (`AI_PROVIDER`). */
export function modelIdFor(tier: ModelTier): ModelId {
  return MODELS[env.AI_PROVIDER === "google" ? "google" : "anthropic"][tier];
}

/**
 * USD per million tokens, the single source of truth for cost tracking.
 * Anthropic source: https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-11-21).
 * Haiku 5.5 is priced at $0.50 / $2.50 for prompts over 100k tokens. No prompt here gets near
 * that: the largest is a CV analysis, whose CV text is capped at 40,000 characters (about 10k
 * tokens, see MAX_CV_PROMPT_CHARS), so only the standard tier is listed.
 * Gemini source: https://ai.google.dev/gemini-api/docs/pricing (checked 2026-11-22). These are
 * the PAID list prices. The free tier bills $0, but the figures are kept so the global daily
 * budget still acts as an abuse cap there. Gemini 3.6 Flash is $0.75 / $3.75 until 2026-12-31
 * and $1.50 / $7.50 after, so the higher price is used. Output prices include thinking tokens.
 */
export const PRICES: Record<ModelId, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.6-flash": { input: 1.5, output: 7.5 },
};

/** Output cap per AI call, so one request can never run up an unbounded bill. */
export const MAX_OUTPUT_TOKENS = {
  cvAnalysis: 8000,
  jobNormalize: 3000,
  rerank: 3000,
  letter: 1500,
} as const;
