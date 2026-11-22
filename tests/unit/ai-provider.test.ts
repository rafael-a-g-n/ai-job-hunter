import { beforeEach, describe, expect, it, vi } from "vitest";

const google = vi.hoisted(() => ({ factory: vi.fn(), model: vi.fn() }));
const anthropic = vi.hoisted(() => ({ factory: vi.fn(), model: vi.fn() }));
const envMock = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: (opts: unknown) => {
    google.factory(opts);
    return google.model;
  },
}));
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: (opts: unknown) => {
    anthropic.factory(opts);
    return anthropic.model;
  },
}));
vi.mock("@/lib/env", () => envMock);

import { computeCostUsd } from "@/server/ai/cost";
import { MODELS, modelIdFor, PRICES } from "@/server/ai/models";
import { getModel } from "@/server/ai/provider";

beforeEach(() => {
  vi.clearAllMocks();
  google.model.mockReturnValue({ id: "google-model" });
  anthropic.model.mockReturnValue({ id: "anthropic-model" });
});

describe("getModel", () => {
  it("uses Google with the tier's Gemini id and the API key", () => {
    envMock.env = { AI_PROVIDER: "google", GOOGLE_GENERATIVE_AI_API_KEY: "g-key" };
    getModel("fast", "test.echo");
    getModel("strong", "test.echo");
    expect(google.factory).toHaveBeenCalledWith({ apiKey: "g-key" });
    expect(google.model).toHaveBeenNthCalledWith(1, MODELS.google.fast);
    expect(google.model).toHaveBeenNthCalledWith(2, MODELS.google.strong);
    expect(anthropic.factory).not.toHaveBeenCalled();
  });

  it("keeps using Anthropic for AI_PROVIDER=anthropic", () => {
    envMock.env = { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a-key" };
    getModel("strong", "test.echo");
    expect(anthropic.factory).toHaveBeenCalledWith({ apiKey: "a-key" });
    expect(anthropic.model).toHaveBeenCalledWith("claude-sonnet-5-5");
  });
});

describe("modelIdFor", () => {
  it("is provider-dependent; mock reports the Anthropic ids", () => {
    envMock.env = { AI_PROVIDER: "google" };
    expect(modelIdFor("fast")).toBe(MODELS.google.fast);
    envMock.env = { AI_PROVIDER: "anthropic" };
    expect(modelIdFor("strong")).toBe("claude-sonnet-5-5");
    envMock.env = { AI_PROVIDER: "mock" };
    expect(modelIdFor("fast")).toBe("claude-haiku-5-5");
  });
});

describe("cost for Gemini ids", () => {
  it("prices every Gemini model and computes from the paid list prices", () => {
    envMock.env = { AI_PROVIDER: "google" };
    for (const id of Object.values(MODELS.google)) expect(PRICES[id]).toBeDefined();
    const p = PRICES[MODELS.google.strong];
    expect(computeCostUsd("strong", 1000, 500)).toBeCloseTo(
      (1000 * p.input + 500 * p.output) / 1_000_000,
      12,
    );
    expect(computeCostUsd("strong", 1000, 500)).toBeGreaterThan(0);
  });
});
