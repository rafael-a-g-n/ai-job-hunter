import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { MODELS, PRICES, type ModelTier } from "./models";

export function computeCostUsd(
  model: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICES[MODELS[model]];
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export type AiCallRecord = {
  purpose: string;
  userId?: string;
  model: ModelTier;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  ok: boolean;
};

export type RecordAiCall = (call: AiCallRecord) => Promise<void>;

/** Writes one AiCall row, with the cost computed from PRICES. */
export const recordAiCall: RecordAiCall = async (call) => {
  await db.aiCall.create({
    data: {
      userId: call.userId ?? null,
      purpose: call.purpose,
      model: MODELS[call.model],
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costUsd: computeCostUsd(call.model, call.inputTokens, call.outputTokens).toFixed(6),
      durationMs: call.durationMs,
      ok: call.ok,
    } satisfies Prisma.AiCallUncheckedCreateInput,
  });
};
