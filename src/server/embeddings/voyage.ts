import { AppError } from "@/lib/errors";
import type { Embedder } from "./embedder";
import { defaultSleep, postJsonWithRetry, toBatches, type EmbedHttpOptions } from "./http";
import { assertDims, EMBEDDING_DIMS } from "./vector";

// Re-exported for existing importers; batching and retry are shared with the Gemini embedder.
export { MAX_BATCH_INPUTS, MAX_BATCH_TOKENS, toBatches } from "./http";

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5-lite";

type VoyageResponse = { data: { index: number; embedding: number[] }[] };

export type VoyageOptions = EmbedHttpOptions;

export class VoyageEmbedder implements Embedder {
  private readonly http: Required<EmbedHttpOptions>;

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
    opts: VoyageOptions = {},
  ) {
    this.http = { timeoutMs: opts.timeoutMs ?? 20_000, sleep: opts.sleep ?? defaultSleep };
  }

  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const out: number[][] = [];
    for (const batch of toBatches(texts)) out.push(...(await this.embedBatch(batch, kind)));
    return out;
  }

  private async embedBatch(batch: string[], kind: "document" | "query"): Promise<number[][]> {
    const res = await postJsonWithRetry(
      this.fetchFn,
      ENDPOINT,
      { authorization: `Bearer ${this.apiKey}` },
      { model: MODEL, input: batch, input_type: kind, output_dimension: EMBEDDING_DIMS },
      this.http,
    );
    const body = (await res.json()) as VoyageResponse;
    const vectors = [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (vectors.length !== batch.length) {
      throw new AppError("EMBEDDING_FAILED", "Embedding response had the wrong size.");
    }
    vectors.forEach(assertDims);
    return vectors;
  }
}
