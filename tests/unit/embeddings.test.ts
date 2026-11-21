import { describe, expect, it, vi } from "vitest";
import { FakeEmbedder } from "@/server/embeddings/fake";
import { assertDims, toPgVector } from "@/server/embeddings/vector";
import { VoyageEmbedder } from "@/server/embeddings/voyage";

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

describe("VoyageEmbedder", () => {
  it("batches by 128 and sends the documented request shape", async () => {
    const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      const data = body.input.map((_, index) => ({
        index,
        embedding: new Array<number>(1024).fill(0),
      }));
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
    const out = await new VoyageEmbedder("key", fetchFn as unknown as typeof fetch).embed(
      Array.from({ length: 130 }, (_, i) => `t${i}`),
      "query",
    );
    expect(out).toHaveLength(130);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
    expect(first).toMatchObject({
      model: "voyage-3.5-lite",
      input_type: "query",
      output_dimension: 1024,
    });
    expect(first.input).toHaveLength(128);
  });
});
