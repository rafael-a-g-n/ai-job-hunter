import type { LanguageModelV4 } from "@ai-sdk/provider";
import { streamText } from "ai";
import { estimateTokens } from "./estimate";
import { describeError, resolveDeps, safeRecord, type AiDeps } from "./deps";
import type { MockKey } from "./mock";
import type { ModelTier } from "./models";
import { getModel } from "./provider";
import { PROVIDER_OPTIONS } from "./provider-options";

export type StreamAiTextOptions = {
  purpose: string;
  userId?: string;
  model: ModelTier;
  system: string;
  prompt: string;
  mockKey: MockKey;
  maxOutputTokens: number;
  /**
   * Aborting stops the provider request and records the call as not ok, with an estimated cost
   * (no usage is reported for an aborted stream).
   */
  abortSignal?: AbortSignal;
};

/** Streams text. Usage is logged once the stream finishes (ok=false if it errored). */
export async function streamAiText(opts: StreamAiTextOptions, deps: AiDeps = {}) {
  const { record, assertBudget } = await resolveDeps(deps);
  await assertBudget();
  const model: LanguageModelV4 = deps.model ?? getModel(opts.model, opts.mockKey);
  const started = Date.now();
  const base = { purpose: opts.purpose, userId: opts.userId, model: opts.model };
  let streamed = "";
  // An aborted or failed stream still cost money: estimate it so the global budget sees it.
  // Gemini thinking tokens are billed as output but never streamed, so they are missing from this
  // estimate; PROVIDER_OPTIONS keeps them near zero ("minimal"), so the gap is small.
  const estimated = () => ({
    inputTokens: estimateTokens(opts.system + opts.prompt),
    outputTokens: estimateTokens(streamed),
  });

  return streamText({
    model,
    system: opts.system,
    prompt: opts.prompt,
    maxRetries: 0,
    maxOutputTokens: opts.maxOutputTokens,
    providerOptions: PROVIDER_OPTIONS,
    abortSignal: opts.abortSignal,
    onChunk: ({ chunk }) => {
      if (chunk.type === "text-delta") streamed += chunk.text;
    },
    onFinish: async ({ totalUsage }) => {
      await safeRecord(record, {
        ...base,
        inputTokens: totalUsage.inputTokens ?? 0,
        outputTokens: totalUsage.outputTokens ?? 0,
        durationMs: Date.now() - started,
        ok: true,
      });
    },
    onAbort: async () => {
      await safeRecord(record, {
        ...base,
        ...estimated(),
        durationMs: Date.now() - started,
        ok: false,
      });
    },
    onError: async ({ error }) => {
      console.error(`[ai] stream ${opts.purpose} (${opts.model}) failed: ${describeError(error)}`);
      await safeRecord(record, {
        ...base,
        ...estimated(),
        durationMs: Date.now() - started,
        ok: false,
      });
    },
  });
}
