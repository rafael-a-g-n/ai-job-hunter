import { describe, expect, it, vi } from "vitest";
import { FakeEmbedder } from "@/server/embeddings/fake";
import { assertDims, toPgVector } from "@/server/embeddings/vector";
import { toBatches, VoyageEmbedder } from "@/server/embeddings/voyage";

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

describe("FakeEmbedder", () => {
  it("returns 1024-d unit vectors, deterministically", async () => {
    const [a] = await new FakeEmbedder().embed(["react typescript frontend"], "query");
    const [b] = await new FakeEmbedder().embed(["react typescript frontend"], "document");
    expect(a).toHaveLength(1024);
    expect(Math.hypot(...a)).toBeCloseTo(1, 6);
    expect(b).toEqual(a);
  });

  it("puts similar texts closer together", async () => {
    const [q, near, far] = await new FakeEmbedder().embed(
      ["react typescript frontend", "frontend developer react", "warehouse forklift driver"],
      "document",
    );
    expect(dot(q, near)).toBeGreaterThan(dot(q, far));
  });
});

describe("pgvector helpers", () => {
  it("formats a vector literal", () => {
    const v = Array.from({ length: 1024 }, (_, i) => (i === 0 ? 0.5 : 0));
    expect(toPgVector(v).startsWith("[0.5,0,0")).toBe(true);
    expect(toPgVector(v).endsWith("0]")).toBe(true);
  });

  it("rejects the wrong dimension", () => {
    expect(() => assertDims([1, 2, 3])).toThrow();
    expect(() => toPgVector([1, 2, 3])).toThrow();
  });
});

const ok = (init?: RequestInit) => {
  const body = JSON.parse(String(init?.body)) as { input: string[] };
  const data = body.input.map((_, index) => ({
    index,
    embedding: new Array<number>(1024).fill(0),
  }));
  return new Response(JSON.stringify({ data }), { status: 200 });
};

function voyage(responses: ((init?: RequestInit) => Response | Promise<Response>)[]) {
  const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const next = responses.length > 1 ? responses.shift()! : responses[0];
    return next(init);
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const embedder = new VoyageEmbedder("key", fetchFn as unknown as typeof fetch, { sleep });
  return { fetchFn, sleep, embedder };
}

describe("VoyageEmbedder", () => {
  it("batches by 32 inputs and sends the documented request shape with a timeout", async () => {
    const { fetchFn, embedder } = voyage([ok]);
    const out = await embedder.embed(
      Array.from({ length: 70 }, (_, i) => `t${i}`),
      "query",
    );
    expect(out).toHaveLength(70);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const first = JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
    expect(first).toMatchObject({
      model: "voyage-3.5-lite",
      input_type: "query",
      output_dimension: 1024,
    });
    expect(first.input).toHaveLength(32);
    expect(fetchFn.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps a batch under about 8k tokens", () => {
    const big = "x".repeat(12_000); // ~3000 tokens
    expect(toBatches([big, big, big, big]).map((b) => b.length)).toEqual([2, 2]);
    expect(toBatches(Array.from({ length: 33 }, () => "a")).map((b) => b.length)).toEqual([32, 1]);
  });

  it("retries a 429, honouring Retry-After, then succeeds", async () => {
    const { fetchFn, sleep, embedder } = voyage([
      () => new Response("slow down", { status: 429, headers: { "retry-after": "2" } }),
      ok,
    ]);
    expect(await embedder.embed(["a"], "document")).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("retries a 5xx with backoff and gives up after 3 attempts", async () => {
    const { fetchFn, sleep, embedder } = voyage([() => new Response("down", { status: 503 })]);
    await expect(embedder.embed(["a"], "document")).rejects.toMatchObject({
      code: "EMBEDDING_FAILED",
    });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("retries a network error or timeout", async () => {
    const { fetchFn, embedder } = voyage([
      () => Promise.reject(new DOMException("timed out", "TimeoutError")),
      ok,
    ]);
    expect(await embedder.embed(["a"], "document")).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx other than 429", async () => {
    const { fetchFn, embedder } = voyage([() => new Response("bad key", { status: 401 })]);
    await expect(embedder.embed(["a"], "document")).rejects.toMatchObject({
      code: "EMBEDDING_FAILED",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
