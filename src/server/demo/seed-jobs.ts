import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getEmbedder } from "@/server/embeddings/embedder";
import { toPgVector } from "@/server/embeddings/vector";
import { embeddingText } from "@/server/jobs/ingest";
import { createAdzunaAdapter } from "@/server/jobs/sources/adzuna";
import { arbeitnowAdapter } from "@/server/jobs/sources/arbeitnow";
import { createRemotiveAdapter } from "@/server/jobs/sources/remotive";
import type { NormalizedJob } from "@/server/jobs/sources/types";
import { computeDedupeHash } from "@/server/jobs/sources/util";
import { extraSeedJobs } from "./seed-jobs-data";

const SEED_TTL_MS = 30 * 24 * 3600 * 1000;
const EMBED_CHUNK = 100;
const FIXTURE_DIR = path.resolve(process.cwd(), "tests/fixtures/jobs");

/** Serves the recorded API responses, so the real adapters' mapping code runs without a network. */
const fixtureFetch: typeof fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  const name = url.includes("adzuna")
    ? "adzuna"
    : url.includes("arbeitnow")
      ? "arbeitnow"
      : "remotive";
  return new Response(readFileSync(path.join(FIXTURE_DIR, `${name}.json`), "utf8"), {
    headers: { "Content-Type": "application/json" },
  });
};

/** The seed set: the normalised adapter fixtures plus hand-written extras, deduped by hash. */
export async function buildSeedJobs(): Promise<(NormalizedJob & { dedupeHash: string })[]> {
  const adapters = [
    createAdzunaAdapter({ appId: "fixture", appKey: "fixture" }),
    arbeitnowAdapter,
    // null: keep every recorded job, so the demo template's job hashes stay valid.
    createRemotiveAdapter(null),
  ];
  const fetched = (await Promise.all(adapters.map((a) => a.fetchJobs(fixtureFetch)))).flat();
  const byHash = new Map<string, NormalizedJob & { dedupeHash: string }>();
  for (const j of [...fetched, ...extraSeedJobs()]) {
    const dedupeHash = computeDedupeHash(j);
    byHash.set(dedupeHash, { ...j, dedupeHash });
  }
  return [...byHash.values()];
}

/**
 * Upserts the seed jobs (by dedupeHash, so it is idempotent) with a fresh 30 day expiry, then
 * embeds every seed job that has no vector yet. Returns the number of seed jobs.
 */
export async function seedJobs(client: PrismaClient): Promise<number> {
  const jobs = await buildSeedJobs();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SEED_TTL_MS);

  for (const j of jobs) {
    const data = {
      source: j.source,
      externalId: j.externalId,
      title: j.title,
      company: j.company,
      location: j.location,
      remote: j.remote,
      remoteScope: j.remoteScope,
      description: j.description,
      url: j.url,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      currency: j.currency,
      postedAt: j.postedAt,
    };
    await client.job.upsert({
      where: { dedupeHash: j.dedupeHash },
      create: { ...data, dedupeHash: j.dedupeHash, fetchedAt: now, expiresAt },
      update: { fetchedAt: now, expiresAt },
    });
  }

  const hashes = jobs.map((j) => j.dedupeHash);
  const missing = await client.$queryRaw<
    { id: string; title: string; company: string; location: string | null; description: string }[]
  >`SELECT "id", "title", "company", "location", "description" FROM "Job"
    WHERE "dedupeHash" IN (${Prisma.join(hashes)}) AND "embedding" IS NULL`;
  const embedder = getEmbedder();
  for (let i = 0; i < missing.length; i += EMBED_CHUNK) {
    const chunk = missing.slice(i, i + EMBED_CHUNK);
    const vectors = await embedder.embed(chunk.map(embeddingText), "document");
    const values = chunk.map((r, k) => Prisma.sql`(${r.id}, ${toPgVector(vectors[k])})`);
    await client.$executeRaw`UPDATE "Job" AS j SET "embedding" = v.e::vector FROM (VALUES ${Prisma.join(values)}) AS v(id, e) WHERE j."id" = v.id`;
  }
  return jobs.length;
}
