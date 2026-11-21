export const EMBEDDING_DIMS = 1024;

export function assertDims(v: number[]): void {
  if (v.length !== EMBEDDING_DIMS) {
    throw new Error(`Expected a ${EMBEDDING_DIMS}-dimensional vector, got ${v.length}`);
  }
}

/** Formats a vector as a pgvector literal: '[0.1,0.2,...]'. */
export function toPgVector(v: number[]): string {
  assertDims(v);
  return `[${v.join(",")}]`;
}
