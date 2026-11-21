import { env } from "@/lib/env";
import { FakeEmbedder } from "./fake";
import { VoyageEmbedder } from "./voyage";

export interface Embedder {
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
}

export function getEmbedder(): Embedder {
  if (env.EMBEDDINGS_PROVIDER === "fake") return new FakeEmbedder();
  return new VoyageEmbedder(env.VOYAGE_API_KEY ?? "");
}
