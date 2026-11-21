import type { LanguageModelV4 } from "@ai-sdk/provider";
import { streamText } from "ai";
import { resolveDeps, type AiDeps } from "./deps";
import type { ModelTier } from "./models";
import { getModel } from "./provider";

export type StreamAiTextOptions = {
  purpose: string;
  userId?: string;
  model: ModelTier;
  system: string;
  prompt: string;
  mockKey: string;
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
    onFinish: async ({ totalUsage }) => {
      await record({
        ...base,
        inputTokens: totalUsage.inputTokens ?? 0,
        outputTokens: totalUsage.outputTokens ?? 0,
        durationMs: Date.now() - started,
        ok: true,
      });
    },
    onError: async () => {
      await record({
        ...base,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - started,
        ok: false,
      });
    },
  });
}
