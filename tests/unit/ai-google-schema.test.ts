import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { CvAnalysisAiResult } from "@/server/cv/schemas";
import { NormalizedManualJob } from "@/server/jobs/manual-schema";
import { RerankResult } from "@/server/matching/schemas";

/** Captures the request the Google provider would send, answering with an empty JSON object. */
async function requestBodyFor(schema: ZodType) {
  let body: Record<string, unknown> = {};
  const fetch = (async (_url: unknown, init?: { body?: string }) => {
    body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ text: "{}" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      }),
      { headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof globalThis.fetch;
  const model = createGoogleGenerativeAI({ apiKey: "test", fetch })("gemini-3.6-flash");
  await generateText({ model, prompt: "p", output: Output.object({ schema }) }).catch(() => {});
  return body;
}

describe("Zod schemas with Gemini structured output", () => {
  it.each([
    ["CvAnalysisAiResult", CvAnalysisAiResult],
    ["RerankResult", RerankResult],
    ["NormalizedManualJob", NormalizedManualJob],
  ])("%s is sent as a JSON schema without unsupported keywords", async (_n, schema) => {
    const body = await requestBodyFor(schema);
    const config = body.generationConfig as Record<string, unknown>;
    expect(config.responseMimeType).toBe("application/json");
    const json = JSON.stringify(config.responseJsonSchema);
    expect(json).toContain('"type":"object"');
    // Gemini rejects `const`, and the provider must have rewritten it to a one-value enum.
    expect(json).not.toContain('"const"');
    expect(json).not.toContain("$ref");
  });
});
