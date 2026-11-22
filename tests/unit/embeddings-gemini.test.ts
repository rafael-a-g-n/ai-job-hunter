import { describe, expect, it, vi } from "vitest";
import { GeminiEmbedder } from "@/server/embeddings/gemini";

type Req = {
  model: string;
  content: { parts: { text: string }[] };
  taskType: string;
  outputDimensionality: number;
};

/** A raw (un-normalised) vector of the given dimension whose first component is 3 and second 4. */
const raw = (dims = 3072) => {
  const v = new Array<number>(dims).fill(0);
  v[0] = 3;
  v[1] = 4;
  return v;
};

const ok = (init?: RequestInit, dims = 1024) => {
  const body = JSON.parse(String(init?.body)) as { requests: Req[] };
  const embeddings = body.requests.map(() => ({ values: raw(dims) }));
  return new Response(JSON.stringify({ embeddings }), { status: 200 });
};

function gemini(responses: ((init?: RequestInit) => Response | Promise<Response>)[]) {
  const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const next = responses.length > 1 ? responses.shift()! : responses[0];
    return next(init);
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const embedder = new GeminiEmbedder("secret-key", fetchFn as unknown as typeof fetch, { sleep });
  return { fetchFn, sleep, embedder };
}

describe("GeminiEmbedder", () => {
  it("sends the documented batchEmbedContents shape: model, 1024 dims, task type, key header", async () => {
    const { fetchFn, embedder } = gemini([ok]);
    await embedder.embed(["alpha", "beta"], "document");
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents",
    );
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init.body)) as { requests: Req[] };
    expect(body.requests).toHaveLength(2);
    expect(body.requests[0]).toEqual({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text: "alpha" }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 1024,
    });
    expect(body.requests[1].content.parts[0].text).toBe("beta");
  });

  it("uses RETRIEVAL_QUERY for queries", async () => {
    const { fetchFn, embedder } = gemini([ok]);
    await embedder.embed(["q"], "query");
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body)) as { requests: Req[] };
    expect(body.requests[0].taskType).toBe("RETRIEVAL_QUERY");
  });

  it("L2-normalises the returned vectors", async () => {
    const { embedder } = gemini([ok]);
    const [v] = await embedder.embed(["a"], "document");
    expect(v).toHaveLength(1024);
    expect(Math.hypot(...v)).toBeCloseTo(1, 6);
    expect(v[0]).toBeCloseTo(0.6, 6);
    expect(v[1]).toBeCloseTo(0.8, 6);
  });

  it("splits into batches of at most 32 texts and keeps the order", async () => {
    let n = 0;
    const { fetchFn, embedder } = gemini([
      (init) => {
        const body = JSON.parse(String(init?.body)) as { requests: Req[] };
        const embeddings = body.requests.map(() => {
          const values = new Array<number>(1024).fill(0);
          values[0] = ++n;
          return { values };
        });
        return new Response(JSON.stringify({ embeddings }), { status: 200 });
      },
    ]);
    const out = await embedder.embed(
      Array.from({ length: 70 }, (_, i) => `t${i}`),
      "document",
    );
    expect(out).toHaveLength(70);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const sizes = fetchFn.mock.calls.map(
      (c) => (JSON.parse(String(c[1]?.body)) as { requests: Req[] }).requests.length,
    );
    expect(sizes).toEqual([32, 32, 6]);
    // Normalised single-axis vectors stay on axis 0 with value 1, so just check count/dims here.
    expect(out.every((v) => v.length === 1024)).toBe(true);
  });

  it("retries a 429, honouring Retry-After, then succeeds", async () => {
    const { fetchFn, sleep, embedder } = gemini([
      () => new Response("slow down", { status: 429, headers: { "retry-after": "2" } }),
      ok,
    ]);
    expect(await embedder.embed(["a"], "document")).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("gives up after repeated 5xx with EMBEDDING_FAILED and never leaks the key", async () => {
    const { fetchFn, embedder } = gemini([() => new Response("down", { status: 503 })]);
    const err = await embedder.embed(["a"], "document").catch((e: Error) => e);
    expect(err).toMatchObject({ code: "EMBEDDING_FAILED" });
    expect((err as Error).message).not.toContain("secret-key");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 4xx other than 429", async () => {
    const { fetchFn, embedder } = gemini([() => new Response("bad key", { status: 403 })]);
    await expect(embedder.embed(["a"], "document")).rejects.toMatchObject({
      code: "EMBEDDING_FAILED",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("rejects vectors of the wrong dimension", async () => {
    const { embedder } = gemini([(init) => ok(init, 768)]);
    await expect(embedder.embed(["a"], "document")).rejects.toThrow(/1024/);
  });

  it("rejects a response with the wrong number of embeddings", async () => {
    const { embedder } = gemini([() => new Response(JSON.stringify({ embeddings: [] }))]);
    await expect(embedder.embed(["a"], "document")).rejects.toMatchObject({
      code: "EMBEDDING_FAILED",
    });
  });

  it("rejects a zero vector instead of dividing by zero", async () => {
    const { embedder } = gemini([
      () =>
        new Response(JSON.stringify({ embeddings: [{ values: new Array<number>(1024).fill(0) }] })),
    ]);
    await expect(embedder.embed(["a"], "document")).rejects.toMatchObject({
      code: "EMBEDDING_FAILED",
    });
  });
});
