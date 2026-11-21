import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { db } from "@/lib/db";
import { computeCostUsd } from "@/server/ai/cost";
import { streamAiText } from "@/server/ai/stream";
import { generateStructured } from "@/server/ai/structured";

const UID = "ai-user";
const schema = z.object({ ok: z.boolean() });
const usage = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 500, text: 500, reasoning: 0 },
};
const reply = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
});
const opts = {
  purpose: "CV_ANALYSIS",
  userId: UID,
  model: "strong" as const,
  schema,
  system: "s",
  prompt: "p",
  mockKey: "test.echo" as const,
};

beforeEach(async () => {
  await db.user.create({ data: { id: UID, name: "Ai", email: "ai@example.com" } });
});

describe("AiCall logging", () => {
  it("writes tokens and a cost computed from PRICES on success", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [reply('{"ok":true}')] });
    await generateStructured(opts, { model });
    const rows = await db.aiCall.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: UID,
      purpose: "CV_ANALYSIS",
      model: "claude-sonnet-5-5",
      inputTokens: 1000,
      outputTokens: 500,
      ok: true,
    });
    // sonnet: 1000 * $2/M + 500 * $10/M = $0.007
    expect(computeCostUsd("strong", 1000, 500)).toBeCloseTo(0.007, 9);
    expect(Number(rows[0].costUsd)).toBeCloseTo(0.007, 6);
  });

  it("writes ok=false for a failed attempt", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [reply("bad"), reply("worse")] });
    await expect(generateStructured(opts, { model })).rejects.toMatchObject({
      code: "AI_FAILED",
    });
    const rows = await db.aiCall.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.ok)).toBe(true);
  });

  it("logs streamed usage in onFinish", async () => {
    const result = await streamAiText({
      purpose: "COVER_LETTER",
      userId: UID,
      model: "fast",
      system: "s",
      prompt: "p",
      mockKey: "test.echo" as const,
    });
    expect(await result.text).toContain("hello from the mock");
    await new Promise((r) => setTimeout(r, 50));
    const rows = await db.aiCall.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ok: true,
      model: "claude-haiku-5-5",
      inputTokens: 10,
      outputTokens: 20,
    });
  });
});
