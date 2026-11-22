import { env } from "@/lib/env";
import { FakeEmbedder } from "./fake";
import { GeminiEmbedder } from "./gemini";
import { VoyageEmbedder } from "./voyage";

export interface Embedder {
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
}

export function getEmbedder(): Embedder {
  if (env.EMBEDDINGS_PROVIDER === "fake") return new FakeEmbedder();
  if (env.EMBEDDINGS_PROVIDER === "gemini") {
    return new GeminiEmbedder(env.GOOGLE_GENERATIVE_AI_API_KEY ?? "");
  }
  return new VoyageEmbedder(env.VOYAGE_API_KEY ?? "");
}

/**
 * Most jobs one ingest run embeds per source (new rows plus repair). The Gemini free tier is
 * small (about 100 requests/min and 1,000 a day, each text counting as one request, and ~30k
 * tokens/min), so it embeds fewer per run; the backlog drains over the next runs.
 */
export function embedBudgetPerRun(): number {
  return env.EMBEDDINGS_PROVIDER === "gemini" ? 50 : 500;
}
