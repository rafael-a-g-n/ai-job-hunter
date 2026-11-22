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
 * Most jobs an ingest run embeds (new rows plus repair). The Gemini free tier is small (about
 * 100 requests/min and 1,000 a day, each text counting as one request, and ~30k tokens/min), so
 * its budget is small and GLOBAL to the run (see embedBudgetIsShared); the backlog drains over
 * the next runs. Voyage keeps 500 per source.
 */
export function embedBudgetPerRun(): number {
  return env.EMBEDDINGS_PROVIDER === "gemini" ? 40 : 500;
}

/**
 * True when one budget covers the whole run. Sources ingest concurrently, so a per-source budget
 * would multiply the load on a rate-limited provider (Gemini) by the number of sources.
 */
export function embedBudgetIsShared(): boolean {
  return env.EMBEDDINGS_PROVIDER === "gemini";
}
