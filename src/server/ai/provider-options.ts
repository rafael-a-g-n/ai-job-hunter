/**
 * Per-provider call options, keyed by provider namespace; a provider ignores namespaces that are
 * not its own (the Anthropic provider and the mock never read `google`).
 *
 * Gemini 3.x models think by default and the thinking tokens count against maxOutputTokens, so a
 * structured answer or a letter can be cut short, or come back empty, with the default level.
 * "minimal" keeps thinking close to zero; none of our calls (extraction, normalising, ranking,
 * writing) needs more.
 */
export const PROVIDER_OPTIONS = {
  google: { thinkingConfig: { thinkingLevel: "minimal" } },
} as const;
