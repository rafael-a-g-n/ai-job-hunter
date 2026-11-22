import { AppError } from "@/lib/errors";
import { estimateTokens } from "@/server/ai/estimate";

/** Per request: small enough to stay well inside the providers' per-request and per-minute limits. */
export const MAX_BATCH_INPUTS = 32;
export const MAX_BATCH_TOKENS = 8000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_RETRY_AFTER_MS = 30_000;

export type EmbedHttpOptions = {
  /** Per request. Default 20000. */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

/** Provider-specific 429 handling, for providers that put the wait in the error body. */
export type RateLimitHint = {
  /** Wait in ms read from a 429 response body (never logged); null when it has none. */
  delayMs: (body: string) => number | null;
  /** A longer wait than this is not worth it (the run has a deadline): fail at once instead. */
  maxWaitMs: number;
};

/**
 * POSTs a JSON body, retrying 429, 5xx, timeouts and network errors (MAX_ATTEMPTS in all) with
 * exponential backoff, or Retry-After when given. Returns the first ok response; any other
 * outcome throws EMBEDDING_FAILED (status only: never the body, the url or the key).
 */
export async function postJsonWithRetry(
  fetchFn: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  { timeoutMs, sleep }: Required<EmbedHttpOptions>,
  hint?: RateLimitHint,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      if (attempt >= MAX_ATTEMPTS) {
        throw new AppError("EMBEDDING_FAILED", "Embedding request failed (no response).");
      }
      await sleep(backoff);
      continue;
    }
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new AppError("EMBEDDING_FAILED", `Embedding request failed (${res.status}).`);
    }
    let wait = retryAfterMs(res);
    if (wait === null && hint && res.status === 429) {
      wait = hint.delayMs(await res.text().catch(() => ""));
      if (wait !== null && wait > hint.maxWaitMs) {
        throw new AppError("EMBEDDING_FAILED", "Embedding request failed (429, rate limited).");
      }
    }
    await sleep(wait ?? backoff);
  }
}
