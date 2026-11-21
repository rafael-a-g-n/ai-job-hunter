import type { Embedder } from "./embedder";
import { EMBEDDING_DIMS } from "./vector";

/** FNV-1a, 32-bit. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hashed bag-of-words: texts sharing words share dimensions, so they land closer together. */
export function fakeEmbedding(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMS).fill(0);
  for (const token of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const h = hash(token);
    v[h % EMBEDDING_DIMS] += h & 0x80000000 ? -1 : 1;
  }
  const norm = Math.hypot(...v);
  if (norm === 0) {
    v[0] = 1; // empty text still gets a valid unit vector
    return v;
  }
  return v.map((x) => x / norm);
}

export class FakeEmbedder implements Embedder {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kind is irrelevant to the fake
  async embed(texts: string[], _kind?: "document" | "query"): Promise<number[][]> {
    return texts.map(fakeEmbedding);
  }
}
