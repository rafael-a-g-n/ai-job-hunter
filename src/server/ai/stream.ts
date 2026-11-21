import type { LanguageModelV4 } from "@ai-sdk/provider";
import { streamText } from "ai";
import { describeError, resolveDeps, safeRecord, type AiDeps } from "./deps";
import type { MockKey } from "./mock";
import type { ModelTier } from "./models";
import { getModel } from "./provider";

export type StreamAiTextOptions = {
  purpose: string;
  userId?: string;
  model: ModelTier;
  system: string;
  prompt: string;
  mockKey: MockKey;
  /** Aborting records the call as not ok (no usage is known) and stops the provider request. */
  abortSignal?: AbortSignal;
};

/** Streams text. Usage is logged once the stream finishes (ok=false if it errored). */
export async function streamAiText(opts: StreamAiTextOptions, deps: AiDeps = {}) {
  const { record, assertBudget } = await resolveDeps(deps);
  await assertBudget();
  const model: LanguageModelV4 = deps.model ?? getModel(opts.model, opts.mockKey);
  const started = Date.now();
  const base = { purpose: opts.purpose, userId: opts.userId, model: opts.model };

  return streamText({
    model,
    system: opts.system,
    prompt: opts.prompt,
    maxRetries: 0,
    abortSignal: opts.abortSignal,
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
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - started,
        ok: false,
      });
    },
    onError: async ({ error }) => {
      console.error(`[ai] stream ${opts.purpose} (${opts.model}) failed: ${describeError(error)}`);
      await safeRecord(record, {
        ...base,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - started,
        ok: false,
      });
    },
  });
}
