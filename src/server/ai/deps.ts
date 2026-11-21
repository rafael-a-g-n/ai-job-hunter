import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { RecordAiCall } from "./cost";

/** Overridable collaborators, so tests need neither a network nor a database. */
export type AiDeps = {
  model?: LanguageModelV4;
  record?: RecordAiCall;
  assertBudget?: () => Promise<void>;
};

/** The database-backed defaults load lazily, so unit tests that inject fakes never touch the db. */
export async function resolveDeps(
  deps: AiDeps,
): Promise<{ record: RecordAiCall; assertBudget: () => Promise<void> }> {
  const record = deps.record ?? (await import("./cost")).recordAiCall;
  const assertBudget =
    deps.assertBudget ?? (await import("@/server/limits/usage")).assertGlobalBudget;
  return { record, assertBudget };
}

/** Recording is best effort: a failed insert is logged and never changes the AI outcome. */
export async function safeRecord(
  record: RecordAiCall,
  call: Parameters<RecordAiCall>[0],
): Promise<void> {
  try {
    await record(call);
  } catch (err) {
    console.error(`[ai] failed to record AiCall (${call.purpose}, ${call.model})`, err);
  }
}
