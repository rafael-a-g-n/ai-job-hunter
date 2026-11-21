import { createHash } from "node:crypto";
import { decode } from "html-entities";
import type { z } from "zod";
import type { NormalizedJob } from "./types";

const BLOCK_TAGS = /<\/?(p|div|br|li|ul|ol|h[1-6]|tr|table|section)\b[^>]*>/gi;

function stripOnce(input: string): string {
  return decode(input.replace(BLOCK_TAGS, " ").replace(/<[^>]*>/g, ""));
}

/**
 * Plain text from (possibly entity-escaped) HTML: tags removed, entities decoded,
 * whitespace collapsed. Runs twice because some feeds double-escape their markup.
 */
export function stripHtml(html: string): string {
  let text = stripOnce(html);
  if (/<[a-z/][^>]*>/i.test(text)) text = stripOnce(text);
  return text.replace(/\s+/g, " ").trim();
}

export function computeDedupeHash(
  j: Pick<NormalizedJob, "title" | "company" | "location">,
): string {
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256")
    .update(`${norm(j.title)}|${norm(j.company)}|${norm(j.location)}`)
    .digest("hex");
}

export const REQUEST_TIMEOUT_MS = 15_000;

export async function getJson(
  name: string,
  url: string,
  fetchFn: typeof fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error(`${name} request failed: timeout`);
    }
    throw new Error(`${name} request failed: network error`);
  }
  if (!res.ok) throw new Error(`${name} request failed: ${res.status}`);
  return res.json();
}

/**
 * Validates the response envelope (throws naming the source if it is wrong), then each item
 * on its own so one malformed row is skipped instead of discarding the whole source.
 */
export function parseItems<T extends z.ZodType>(
  name: string,
  json: unknown,
  key: string,
  itemSchema: T,
): z.infer<T>[] {
  const rows = (json as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(rows)) throw new Error(`${name} response invalid`);
  const items: z.infer<T>[] = [];
  let skipped = 0;
  for (const row of rows) {
    const r = itemSchema.safeParse(row);
    if (r.success) items.push(r.data);
    else skipped++;
  }
  if (skipped > 0) console.warn(`${name}: skipped ${skipped} malformed jobs`);
  return items;
}

export function parseDate(value: unknown): Date | null {
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}
