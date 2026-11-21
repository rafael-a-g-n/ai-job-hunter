import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";

/** Add a key here (and its fixture below) when a later task needs a mocked AI call. */
export type MockKey = "test.echo";

/** Deterministic outputs used when AI_PROVIDER=mock. Strings stream as-is, objects as JSON. */
export const MOCK_FIXTURES: Record<MockKey, unknown> = {
  "test.echo": { message: "hello from the mock" },
};

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};

export function mockModel(mockKey: MockKey): LanguageModelV4 {
  if (!Object.hasOwn(MOCK_FIXTURES, mockKey)) {
    throw new Error(`No mock fixture for "${mockKey}". Add it to MOCK_FIXTURES.`);
  }
  const fixture = MOCK_FIXTURES[mockKey];
  const text = typeof fixture === "string" ? fixture : JSON.stringify(fixture);
  const finishReason = { unified: "stop", raw: "stop" } as const;

  return new MockLanguageModelV4({
    provider: "mock",
    modelId: `mock:${mockKey}`,
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason,
      usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: text },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason, usage },
        ],
      }),
    }),
  });
}
