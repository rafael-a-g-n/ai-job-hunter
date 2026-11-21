export const MODELS = { fast: "claude-haiku-5-5", strong: "claude-sonnet-5-5" } as const;

export type ModelTier = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelTier];

/**
 * USD per million tokens, the single source of truth for cost tracking.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-11-21).
 * Haiku 5.5 is priced at $0.50 / $2.50 for prompts over 100k tokens; this app never sends
 * prompts that large, so only the standard tier is listed.
 */
export const PRICES: Record<ModelId, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};
