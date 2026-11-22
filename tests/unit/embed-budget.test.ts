import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.resetModules());

async function budgetFor(provider: string) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({ env: { EMBEDDINGS_PROVIDER: provider } }));
  const { embedBudgetPerRun } = await import("@/server/embeddings/embedder");
  return embedBudgetPerRun();
}

async function sharedFor(provider: string) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({ env: { EMBEDDINGS_PROVIDER: provider } }));
  const { embedBudgetIsShared } = await import("@/server/embeddings/embedder");
  return embedBudgetIsShared();
}

describe("embedBudgetPerRun", () => {
  it("keeps 500 per source for Voyage and the fake, and a small global budget for Gemini", async () => {
    expect(await budgetFor("voyage")).toBe(500);
    expect(await budgetFor("fake")).toBe(500);
    expect(await budgetFor("gemini")).toBe(40);
  });

  it("shares the budget across sources only for Gemini", async () => {
    expect(await sharedFor("voyage")).toBe(false);
    expect(await sharedFor("fake")).toBe(false);
    expect(await sharedFor("gemini")).toBe(true);
  });
});
