import { AppError } from "@/lib/errors";
import type { Embedder } from "./embedder";
import { defaultSleep, postJsonWithRetry, toBatches, type EmbedHttpOptions } from "./http";
import { assertDims, EMBEDDING_DIMS } from "./vector";

const MODEL = "gemini-embedding-001";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;
/** The model accepts 2048 tokens per text; this stays under it even for token-dense text. */
const MAX_TEXT_CHARS = 6000;

type GeminiResponse = { embeddings?: { values?: number[] }[] };

/** Google requires reduced-dimension (non-3072) embeddings to be normalised by the caller. */
function l2Normalize(v: number[]): number[] {
  const norm = Math.hypot(...v);
  if (!(norm > 0)) throw new AppError("EMBEDDING_FAILED", "Embedding response was a zero vector.");
  return v.map((x) => x / norm);
}

/** Gemini Embedding (free tier available), truncated by Matryoshka to EMBEDDING_DIMS. */
export class GeminiEmbedder implements Embedder {
  private readonly http: Required<EmbedHttpOptions>;

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
    opts: EmbedHttpOptions = {},
  ) {
    this.http = { timeoutMs: opts.timeoutMs ?? 20_000, sleep: opts.sleep ?? defaultSleep };
  }

  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const out: number[][] = [];
    for (const batch of toBatches(texts)) out.push(...(await this.embedBatch(batch, kind)));
    return out;
  }

  private async embedBatch(batch: string[], kind: "document" | "query"): Promise<number[][]> {
    const taskType = kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY";
    const res = await postJsonWithRetry(
      this.fetchFn,
      ENDPOINT,
      { "x-goog-api-key": this.apiKey },
      {
        requests: batch.map((text) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text: text.slice(0, MAX_TEXT_CHARS) }] },
          taskType,
          outputDimensionality: EMBEDDING_DIMS,
        })),
      },
      this.http,
    );
    const body = (await res.json()) as GeminiResponse;
    const vectors = (body.embeddings ?? []).map((e) => e.values ?? []);
    if (vectors.length !== batch.length) {
      throw new AppError("EMBEDDING_FAILED", "Embedding response had the wrong size.");
    }
    vectors.forEach(assertDims);
    return vectors.map(l2Normalize);
  }
}
