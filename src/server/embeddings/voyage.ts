import { AppError } from "@/lib/errors";
import type { Embedder } from "./embedder";
import { assertDims, EMBEDDING_DIMS } from "./vector";

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5-lite";
const BATCH_SIZE = 128;

type VoyageResponse = { data: { index: number; embedding: number[] }[] };

export class VoyageEmbedder implements Embedder {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      out.push(...(await this.embedBatch(texts.slice(i, i + BATCH_SIZE), kind)));
    }
    return out;
  }

  private async embedBatch(batch: string[], kind: "document" | "query"): Promise<number[][]> {
    const res = await this.fetchFn(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        input: batch,
        input_type: kind,
        output_dimension: EMBEDDING_DIMS,
      }),
    });
    if (!res.ok) {
      throw new AppError("EMBEDDING_FAILED", `Embedding request failed (${res.status}).`);
    }
    const body = (await res.json()) as VoyageResponse;
    const vectors = [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (vectors.length !== batch.length) {
      throw new AppError("EMBEDDING_FAILED", "Embedding response had the wrong size.");
    }
    vectors.forEach(assertDims);
    return vectors;
  }
}
