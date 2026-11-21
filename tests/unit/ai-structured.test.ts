import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { AiCallRecord } from "@/server/ai/cost";
import { mockModel } from "@/server/ai/mock";
import { generateStructured } from "@/server/ai/structured";

const schema = z.object({ name: z.string(), age: z.number() });
const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 50, text: 50, reasoning: 0 },
};
const reply = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
});

function setup(...texts: string[]) {
  const model = new MockLanguageModelV4({ doGenerate: texts.map(reply) });
  const calls: AiCallRecord[] = [];
  const deps = {
    model,
    record: async (c: AiCallRecord) => void calls.push(c),
    assertBudget: vi.fn(async () => {}),
  };
  const opts = {
    purpose: "test",
    model: "fast" as const,
    schema,
    system: "sys",
    prompt: "p",
    mockKey: "test.echo" as const,
    maxOutputTokens: 1234,
  };
  return { model, calls, deps, opts };
}

describe("generateStructured", () => {
  it("parses valid JSON and logs one ok attempt", async () => {
    const { model, calls, deps, opts } = setup('{"name":"Ada","age":36}');
    expect(await generateStructured(opts, deps)).toEqual({ name: "Ada", age: 36 });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(deps.assertBudget).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      expect.objectContaining({ ok: true, inputTokens: 100, outputTokens: 50, model: "fast" }),
    ]);
  });

  it("retries once after invalid output", async () => {
    const { model, calls, deps, opts } = setup('{"name":1}', '{"name":"Ada","age":36}');
    expect(await generateStructured(opts, deps)).toEqual({ name: "Ada", age: 36 });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(calls.map((c) => c.ok)).toEqual([false, true]);
  });

  it("throws AI_FAILED after two invalid outputs", async () => {
    const { model, calls, deps, opts } = setup("nope", '{"name":1}');
    const err = await generateStructured(opts, deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({
      code: "AI_FAILED",
      userMessage: "The AI service failed. Please try again.",
    });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(calls.map((c) => c.ok)).toEqual([false, false]);
  });

  it("treats a timeout like invalid output: one retry, then AI_FAILED", async () => {
    const calls: AiCallRecord[] = [];
    const model = new MockLanguageModelV4({ doGenerate: () => new Promise(() => {}) });
    const err = await generateStructured(
      {
        purpose: "t",
        model: "fast",
        schema,
        system: "s",
        prompt: "p",
        mockKey: "test.echo" as const,
        maxOutputTokens: 777,
        timeoutMs: 20,
      },
      { model, record: async (c) => void calls.push(c), assertBudget: async () => {} },
    ).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "AI_FAILED" });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(calls.map((c) => c.ok)).toEqual([false, false]);
    // A timed-out attempt reports no usage: it is estimated, assuming the full output cap.
    expect(calls[0]).toMatchObject({ inputTokens: 1, outputTokens: 777 });
  });

  it("passes maxOutputTokens to the model", async () => {
    const { model, deps, opts } = setup('{"name":"Ada","age":36}');
    await generateStructured(opts, deps);
    expect(model.doGenerateCalls[0].maxOutputTokens).toBe(1234);
  });

  it("estimates the cost of a failed attempt whose usage was not reported", async () => {
    const providerError = new Error("500 upstream");
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw providerError;
      },
    });
    const { calls, deps, opts } = setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await generateStructured(
      { ...opts, system: "s".repeat(400), prompt: "p".repeat(400) },
      { ...deps, model },
    ).catch(() => {});
    spy.mockRestore();
    expect(calls).toEqual([expect.objectContaining({ ok: false, inputTokens: 200 })]);
  });

  it("does not call the model when the budget is exhausted", async () => {
    const { model, deps, opts } = setup('{"name":"Ada","age":36}');
    deps.assertBudget.mockRejectedValueOnce(new AppError("BUDGET_EXHAUSTED", "x"));
    await expect(generateStructured(opts, deps)).rejects.toMatchObject({
      code: "BUDGET_EXHAUSTED",
    });
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("works end to end with the mock provider fixture", async () => {
    const { deps, opts } = setup();
    const out = await generateStructured(
      { ...opts, schema: z.object({ message: z.string() }) },
      { ...deps, model: mockModel("test.echo") },
    );
    expect(out).toEqual({ message: "hello from the mock" });
  });

  it("a failing recorder on the success path neither retries nor fails the call", async () => {
    const { model, deps, opts } = setup('{"name":"Ada","age":36}', '{"name":"Bob","age":1}');
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const record = vi.fn(async () => {
      throw new Error("db down");
    });
    expect(await generateStructured(opts, { ...deps, record })).toEqual({ name: "Ada", age: 36 });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(record).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("a failing recorder does not mask AI_FAILED", async () => {
    const { deps, opts } = setup("nope", "nope");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const record = async () => {
      throw new Error("db down");
    };
    await expect(generateStructured(opts, { ...deps, record })).rejects.toMatchObject({
      code: "AI_FAILED",
    });
    spy.mockRestore();
  });

  it("does not retry a provider error and keeps it as the cause", async () => {
    const providerError = new Error("401 invalid x-api-key");
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw providerError;
      },
    });
    const { calls, deps, opts } = setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await generateStructured(opts, { ...deps, model }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: "AI_FAILED" });
    expect((err as AppError).cause).toBe(providerError);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(calls.map((c) => c.ok)).toEqual([false]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("never logs prompt contents carried by provider errors", async () => {
    const MARKER = "SECRET-CV-CONTENT-123";
    const providerError = Object.assign(new Error("500 upstream"), {
      statusCode: 500,
      requestBodyValues: { messages: [{ content: MARKER }] },
      prompt: MARKER,
    });
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw providerError;
      },
    });
    const { deps, opts } = setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await generateStructured(opts, {
      ...deps,
      model,
      record: async () => {
        throw Object.assign(new Error("db down"), { prompt: MARKER });
      },
    }).catch((e: unknown) => e);
    expect((err as AppError).cause).toBe(providerError);
    const logged = JSON.stringify(
      spy.mock.calls.flat().map((a) => (a instanceof Error ? { ...a, m: a.message } : a)),
    );
    expect(spy).toHaveBeenCalled();
    expect(logged).not.toContain(MARKER);
    expect(logged).toContain("500");
    spy.mockRestore();
  });
});
