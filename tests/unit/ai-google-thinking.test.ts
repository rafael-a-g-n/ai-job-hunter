import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { generateText } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateStructured } from "@/server/ai/structured";
import { streamAiText } from "@/server/ai/stream";

const deps = (model: LanguageModelV4) => ({
  model,
  record: async () => {},
  assertBudget: async () => {},
});

function capture(response: () => Response) {
  const state = { body: {} as Record<string, unknown> };
  const fetch = (async (_url: unknown, init?: { body?: string }) => {
    state.body = JSON.parse(String(init?.body));
    return response();
  }) as unknown as typeof globalThis.fetch;
  return { state, fetch };
}

const json = (text: string) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    }),
    { headers: { "content-type": "application/json" } },
  );

const sse = () =>
  new Response(
    `data: ${JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: "hi" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    })}\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );

const thinkingLevel = (body: Record<string, unknown>) =>
  (body.generationConfig as { thinkingConfig?: { thinkingLevel?: string } }).thinkingConfig
    ?.thinkingLevel;

describe("Gemini thinking level", () => {
  it("generateStructured asks for minimal thinking, so thinking cannot eat maxOutputTokens", async () => {
    const { state, fetch } = capture(() => json('{"a":"x"}'));
    const model = createGoogleGenerativeAI({ apiKey: "t", fetch })("gemini-3.6-flash");
    await generateStructured(
      {
        purpose: "t",
        model: "fast",
        schema: z.object({ a: z.string() }),
        system: "s",
        prompt: "p",
        mockKey: "test.echo",
        maxOutputTokens: 100,
      },
      deps(model),
    );
    expect(thinkingLevel(state.body)).toBe("minimal");
  });

  it("streamAiText asks for minimal thinking", async () => {
    const { state, fetch } = capture(sse);
    const model = createGoogleGenerativeAI({ apiKey: "t", fetch })("gemini-3.6-flash");
    const result = await streamAiText(
      {
        purpose: "t",
        model: "strong",
        system: "s",
        prompt: "p",
        mockKey: "letters.generate",
        maxOutputTokens: 100,
      },
      deps(model),
    );
    await result.text;
    expect(thinkingLevel(state.body)).toBe("minimal");
  });

  it("the Anthropic provider ignores the google namespace", async () => {
    const { state, fetch } = capture(
      () =>
        new Response(
          JSON.stringify({
            id: "m",
            type: "message",
            role: "assistant",
            model: "claude-haiku-5-5",
            content: [{ type: "text", text: "hi" }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    const model = createAnthropic({ apiKey: "t", fetch })("claude-haiku-5-5");
    await generateText({
      model,
      prompt: "p",
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } },
    });
    expect(JSON.stringify(state.body)).not.toMatch(/thinking/i);
  });
});
