import { AppError } from "@/lib/errors";
import { estimateTokens } from "@/server/ai/estimate";
import type { Embedder } from "./embedder";
import { assertDims, EMBEDDING_DIMS } from "./vector";

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5-lite";
/** Per request: small enough to stay well inside Voyage's per-request and per-minute limits. */
export const MAX_BATCH_INPUTS = 32;
export const MAX_BATCH_TOKENS = 8000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_RETRY_AFTER_MS = 30_000;

type VoyageResponse = { data: { index: number; embedding: number[] }[] };

export type VoyageOptions = {
  /** Per request. Default 20000. */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/** Splits texts into batches of at most MAX_BATCH_INPUTS and about MAX_BATCH_TOKENS each. */
export function toBatches(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let tokens = 0;
  for (const text of texts) {
    const t = estimateTokens(text);
    if (
      current.length > 0 &&
      (current.length >= MAX_BATCH_INPUTS || tokens + t > MAX_BATCH_TOKENS)
    ) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(text);
    tokens += t;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Retry-After in ms (seconds or an HTTP date), capped; null when absent or unreadable. */
function retryAfterMs(res: Response): number | null {
  const value = res.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS) : null;
}

export class VoyageEmbedder implements Embedder {
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
    opts: VoyageOptions = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const out: number[][] = [];
    for (const batch of toBatches(texts)) out.push(...(await this.embedBatch(batch, kind)));
    return out;
  }

  /** One batch, retried on 429, 5xx, timeouts and network errors (MAX_ATTEMPTS in all). */
  private async embedBatch(batch: string[], kind: "document" | "query"): Promise<number[][]> {
    for (let attempt = 1; ; attempt++) {
      const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      let res: Response;
      try {
        res = await this.fetchFn(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: MODEL,
            input: batch,
            input_type: kind,
            output_dimension: EMBEDDING_DIMS,
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        if (attempt >= MAX_ATTEMPTS) {
          throw new AppError("EMBEDDING_FAILED", "Embedding request failed (no response).");
        }
        await this.sleep(backoff);
        continue;
      }
      if (res.ok) return this.parse(res, batch.length);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        throw new AppError("EMBEDDING_FAILED", `Embedding request failed (${res.status}).`);
      }
      await this.sleep(retryAfterMs(res) ?? backoff);
    }
  }

  private async parse(res: Response, expected: number): Promise<number[][]> {
    const body = (await res.json()) as VoyageResponse;
    const vectors = [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (vectors.length !== expected) {
      throw new AppError("EMBEDDING_FAILED", "Embedding response had the wrong size.");
    }
    vectors.forEach(assertDims);
    return vectors;
  }
}
