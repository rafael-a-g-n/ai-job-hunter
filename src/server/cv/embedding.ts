import { db } from "@/lib/db";
import { describeError } from "@/server/ai/deps";
import { getEmbedder } from "@/server/embeddings/embedder";
import { toPgVector } from "@/server/embeddings/vector";
import { profileToText, type CvProfile } from "./schemas";

/** The profile's embedding as a pgvector literal. Throws if the embeddings provider fails. */
export async function embedProfile(profile: CvProfile): Promise<string> {
  const [vector] = await getEmbedder().embed([profileToText(profile)], "document");
  return toPgVector(vector);
}

/**
 * Like embedProfile, but a provider failure gives null (logged) instead of throwing, so a paid
 * analysis or an edit is still saved; the CV is then embedded lazily by ensureCvEmbedding.
 */
export async function tryEmbedProfile(profile: CvProfile): Promise<string | null> {
  try {
    return await embedProfile(profile);
  } catch (e) {
    console.error("[cv] embedding failed; it will be retried when matches load", describeError(e));
    return null;
  }
}

/** Embeds a CV whose embedding is missing (user-scoped). Throws if the provider fails. */
export async function ensureCvEmbedding(
  userId: string,
  cvId: string,
  profile: CvProfile,
): Promise<void> {
  const [row] = await db.$queryRaw<{ missing: boolean }[]>`
    SELECT ("embedding" IS NULL) AS "missing" FROM "Cv" WHERE "id" = ${cvId} AND "userId" = ${userId}`;
  if (!row?.missing) return;
  const embedding = await embedProfile(profile);
  await db.$executeRaw`UPDATE "Cv" SET "embedding" = ${embedding}::vector WHERE "id" = ${cvId} AND "userId" = ${userId}`;
}
