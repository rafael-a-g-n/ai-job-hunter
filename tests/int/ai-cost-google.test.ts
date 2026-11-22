import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { db } from "@/lib/db";

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    env: new Proxy(actual.env, {
      get: (t, p) => (p === "AI_PROVIDER" ? "google" : t[p as keyof typeof t]),
    }),
  };
});

import { computeCostUsd } from "@/server/ai/cost";
import { generateStructured } from "@/server/ai/structured";

const UID = "ai-google-user";
const usage = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 500, text: 500, reasoning: 0 },
};

beforeEach(async () => {
  await db.user.create({ data: { id: UID, name: "Ai", email: "ai-g@example.com" } });
});

describe("AiCall with AI_PROVIDER=google", () => {
  it("records the Gemini model id and a cost from its PRICES entry", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [{ type: "text" as const, text: '{"ok":true}' }],
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage,
          warnings: [],
        },
      ],
    });
    await generateStructured(
      {
        purpose: "CV_ANALYSIS",
        userId: UID,
        model: "strong",
        schema: z.object({ ok: z.boolean() }),
        system: "s",
        prompt: "p",
        mockKey: "test.echo",
        maxOutputTokens: 100,
      },
      { model },
    );
    const rows = await db.aiCall.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe("gemini-3.6-flash");
    // 1000 * $1.5/M + 500 * $7.5/M = $0.00525
    expect(computeCostUsd("strong", 1000, 500)).toBeCloseTo(0.00525, 9);
    expect(Number(rows[0].costUsd)).toBeCloseTo(0.00525, 6);
  });
});
