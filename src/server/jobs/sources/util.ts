import { createHash } from "node:crypto";
import { decode } from "html-entities";
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

export async function getJson(name: string, url: string, fetchFn: typeof fetch): Promise<unknown> {
  const res = await fetchFn(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${name} request failed: ${res.status}`);
  return res.json();
}

export function parseDate(value: unknown): Date | null {
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}
