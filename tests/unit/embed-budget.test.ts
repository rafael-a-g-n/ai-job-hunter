import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.resetModules());

async function budgetFor(provider: string) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({ env: { EMBEDDINGS_PROVIDER: provider } }));
  const { embedBudgetPerRun } = await import("@/server/embeddings/embedder");
  return embedBudgetPerRun();
}

describe("embedBudgetPerRun", () => {
  it("keeps 500 for Voyage and the fake, and a smaller free-tier budget for Gemini", async () => {
    expect(await budgetFor("voyage")).toBe(500);
    expect(await budgetFor("fake")).toBe(500);
    expect(await budgetFor("gemini")).toBe(50);
  });
});
