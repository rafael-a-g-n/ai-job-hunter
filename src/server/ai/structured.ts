import {
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  TypeValidationError,
} from "ai";
import type { ZodType } from "zod";
import { AppError } from "@/lib/errors";
import type { ModelTier } from "./models";
import { resolveDeps, type AiDeps } from "./deps";
import { getModel } from "./provider";

export type GenerateStructuredOptions<T> = {
  purpose: string;
  userId?: string;
  model: ModelTier;
  schema: ZodType<T>;
  system: string;
  prompt: string;
  mockKey: string;
  /** Per attempt. Default 60000. */
  timeoutMs?: number;
};

/** Overridable collaborators, so tests need neither a network nor a database. */
export type { AiDeps } from "./deps";

const MAX_ATTEMPTS = 2;

class TimeoutError extends Error {}

function isRetryable(err: unknown): boolean {
  return (
    err instanceof TimeoutError ||
    NoObjectGeneratedError.isInstance(err) ||
    NoOutputGeneratedError.isInstance(err) ||
    TypeValidationError.isInstance(err)
  );
}

/** Rejects after `ms`, and also aborts the underlying request via the signal. */
async function withTimeout<R>(ms: number, run: (signal: AbortSignal) => Promise<R>): Promise<R> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(`AI call timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function failedUsage(err: unknown): { inputTokens: number; outputTokens: number } {
  const usage = NoObjectGeneratedError.isInstance(err) ? err.usage : undefined;
  return { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 };
}

/**
 * Generates an object matching `schema`. A schema-invalid answer or a timeout is retried once;
 * after that (or on any other error) it throws AppError('AI_FAILED'). Every attempt is logged.
 */
export async function generateStructured<T>(
  opts: GenerateStructuredOptions<T>,
  deps: AiDeps = {},
): Promise<T> {
  const { record, assertBudget } = await resolveDeps(deps);
  await assertBudget();
  const model = deps.model ?? getModel(opts.model, opts.mockKey);
  const timeoutMs = opts.timeoutMs ?? 60_000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    const base = { purpose: opts.purpose, userId: opts.userId, model: opts.model };
    try {
      const result = await withTimeout(timeoutMs, (abortSignal) =>
        generateText({
          model,
          output: Output.object({ schema: opts.schema }),
          system: opts.system,
          prompt: opts.prompt,
          abortSignal,
          maxRetries: 0,
        }),
      );
      await record({
        ...base,
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        durationMs: Date.now() - started,
        ok: true,
      });
      return result.output as T;
    } catch (err) {
      await record({
        ...base,
        ...failedUsage(err),
        durationMs: Date.now() - started,
        ok: false,
      });
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) break;
    }
  }
  throw new AppError("AI_FAILED", "The AI service failed. Please try again.");
}
