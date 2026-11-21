/** Rough token count for text whose usage the provider never reported (~4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
