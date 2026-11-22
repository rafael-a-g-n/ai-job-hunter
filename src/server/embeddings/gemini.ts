import { AppError } from "@/lib/errors";
import type { Embedder } from "./embedder";
import {
  defaultSleep,
  postJsonWithRetry,
  toBatches,
  type EmbedHttpOptions,
  type RateLimitHint,
} from "./http";
import { assertDims, EMBEDDING_DIMS } from "./vector";

const MODEL = "gemini-embedding-001";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;
/**
 * The model accepts 2048 tokens per text; this stays under it even for token-dense text. Longer
 * texts are cut: with Gemini only the first 6,000 characters of a long CV profile text (or job
 * description) are embedded, so very long CVs are matched on their opening part.
 */
const MAX_TEXT_CHARS = 6000;
/** Longest rate-limit wait honoured: an ingest run (route maxDuration 60 s) cannot afford more. */
const MAX_RATE_LIMIT_WAIT_MS = 10_000;

type GeminiResponse = { embeddings?: { values?: number[] }[] };

/**
 * Delay in ms from a Gemini 429 body: `error.details[]` holds a google.rpc.RetryInfo whose
 * `retryDelay` is a protobuf Duration string such as "34s" or "0.5s". Null when absent.
 */
export function geminiRetryDelayMs(body: string): number | null {
  try {
    const details = (JSON.parse(body) as { error?: { details?: unknown } }).error?.details;
    if (!Array.isArray(details)) return null;
    for (const d of details as { "@type"?: unknown; retryDelay?: unknown }[]) {
      if (typeof d?.["@type"] !== "string" || !d["@type"].endsWith("google.rpc.RetryInfo"))
        continue;
      const m = typeof d.retryDelay === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay) : null;
      if (m) return Math.round(Number(m[1]) * 1000);
    }
  } catch {
    // not JSON: no hint
  }
  return null;
}

const RATE_LIMIT_HINT: RateLimitHint = {
  delayMs: geminiRetryDelayMs,
  maxWaitMs: MAX_RATE_LIMIT_WAIT_MS,
};

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
      RATE_LIMIT_HINT,
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
