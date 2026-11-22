import { Prisma, type JobSource } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { cleanupExpiredDemoUsers } from "@/server/demo/cleanup";
import { templateJobHashes } from "@/server/demo/template";
import { embedBudgetPerRun, getEmbedder } from "@/server/embeddings/embedder";
import { toPgVector } from "@/server/embeddings/vector";
import { MAX_BATCH_INPUTS } from "@/server/embeddings/http";
import { computeDedupeHash, getEnabledAdapters } from "./sources";
import type { JobSourceAdapter, NormalizedJob } from "./sources";

export type IngestSourceReport = {
  source: JobSource;
  skipped?: "interval";
  fetched: number;
  inserted: number;
  error?: string;
};

export type IngestReport = {
  sources: IngestSourceReport[];
  expired: number;
  demoUsersDeleted: number;
};

export const ADAPTER_TIMEOUT_MS = 25_000;
const JOB_TTL_MS = 30 * 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;

const expiryFor = (postedAt: Date | null, fetchedAt: Date) =>
  new Date((postedAt ?? fetchedAt).getTime() + JOB_TTL_MS);

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs fetchJobs with an overall deadline; the timeout also aborts in-flight requests. */
async function fetchWithDeadline(
  adapter: JobSourceAdapter,
  timeoutMs: number,
  baseFetch: typeof fetch,
): Promise<NormalizedJob[]> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const fetchFn: typeof fetch = (input, init) =>
    baseFetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
    });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${adapter.source} timed out after ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([adapter.fetchJobs(fetchFn), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function embeddingText(j: {
  title: string;
  company: string;
  location: string | null;
  description: string;
}) {
  return [j.title, j.company, j.location ?? "", j.description.slice(0, 2000)].join("\n");
}

// One request's worth (see MAX_BATCH_INPUTS), so a chunk is written as soon as it is embedded.
const EMBED_CHUNK = MAX_BATCH_INPUTS;
const REFRESH_CHUNK = 1000;

/** Bulk-refreshes fetchedAt/expiresAt of known jobs; rows whose new expiry is already past are left alone. */
async function refreshExisting(
  rows: { hash: string; expiresAt: Date }[],
  now: Date,
): Promise<void> {
  const live = rows.filter((r) => r.expiresAt > now);
  for (let i = 0; i < live.length; i += REFRESH_CHUNK) {
    const values = live
      .slice(i, i + REFRESH_CHUNK)
      .map((r) => Prisma.sql`(${r.hash}, ${r.expiresAt.toISOString()})`);
    await db.$executeRaw`UPDATE "Job" AS j SET "fetchedAt" = ${now.toISOString()}::timestamp, "expiresAt" = v.e::timestamp FROM (VALUES ${Prisma.join(values)}) AS v(h, e) WHERE j."dedupeHash" = v.h`;
  }
}

/** Inserts new jobs (without embeddings), refreshes known ones. Returns rows actually created. */
async function upsertJobs(jobs: NormalizedJob[], now: Date): Promise<number> {
  const byHash = new Map<string, NormalizedJob>();
  for (const j of jobs) byHash.set(computeDedupeHash(j), j);
  const hashes = [...byHash.keys()];
  if (hashes.length === 0) return 0;

  const existing = new Set(
    (
      await db.job.findMany({ where: { dedupeHash: { in: hashes } }, select: { dedupeHash: true } })
    ).map((j) => j.dedupeHash),
  );

  await refreshExisting(
    [...existing].map((hash) => ({
      hash,
      expiresAt: expiryFor(byHash.get(hash)?.postedAt ?? null, now),
    })),
    now,
  );

  const fresh = [...byHash].filter(
    ([hash, j]) => !existing.has(hash) && expiryFor(j.postedAt, now) > now,
  );
  if (fresh.length === 0) return 0;

  const created = await db.job.createManyAndReturn({
    data: fresh.map(([dedupeHash, j]) => ({
      source: j.source,
      externalId: j.externalId,
      dedupeHash,
      title: j.title,
      company: j.company,
      location: j.location,
      remote: j.remote,
      description: j.description,
      url: j.url,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      currency: j.currency,
      postedAt: j.postedAt,
      fetchedAt: now,
      expiresAt: expiryFor(j.postedAt, now),
    })),
    skipDuplicates: true,
    select: { id: true },
  });
  return created.length;
}

type EmbedRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  description: string;
};

/**
 * Embeds live jobs of a source that have no vector yet (new rows, or rows left behind by an
 * earlier failed run), oldest first, capped per run. One bulk statement per chunk.
 */
async function embedMissing(source: JobSource, now: Date): Promise<void> {
  const rows = await db.$queryRaw<EmbedRow[]>`
    SELECT "id", "title", "company", "location", "description" FROM "Job"
    WHERE "source" = ${source}::"JobSource" AND "expiresAt" > ${now.toISOString()}::timestamp AND "embedding" IS NULL
    ORDER BY "fetchedAt" ASC, "id" ASC LIMIT ${embedBudgetPerRun()}`;
  const embedder = getEmbedder();
  for (let i = 0; i < rows.length; i += EMBED_CHUNK) {
    const chunk = rows.slice(i, i + EMBED_CHUNK);
    const vectors = await embedder.embed(chunk.map(embeddingText), "document");
    const values = chunk.map((r, k) => Prisma.sql`(${r.id}, ${toPgVector(vectors[k])})`);
    await db.$executeRaw`UPDATE "Job" AS j SET "embedding" = v.e::vector FROM (VALUES ${Prisma.join(values)}) AS v(id, e) WHERE j."id" = v.id`;
  }
}

async function runAdapter(
  adapter: JobSourceAdapter,
  now: Date,
  force: boolean,
  timeoutMs: number,
  baseFetch: typeof fetch,
): Promise<IngestSourceReport> {
  const { source } = adapter;
  if (!force) {
    const last = await db.ingestRun.findFirst({
      where: { source, error: null, finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });
    if (
      last?.finishedAt &&
      now.getTime() - last.finishedAt.getTime() < adapter.minIntervalHours * HOUR_MS
    ) {
      return { source, skipped: "interval", fetched: 0, inserted: 0 };
    }
  }

  const startedAt = new Date();
  let fetched = 0;
  let inserted = 0;
  let error: string | undefined;
  try {
    const jobs = await fetchWithDeadline(adapter, timeoutMs, baseFetch);
    fetched = jobs.length;
    inserted = await upsertJobs(jobs, now);
  } catch (err) {
    error = errorMessage(err);
  }
  try {
    await embedMissing(source, now);
  } catch (err) {
    error ??= `embedding failed: ${errorMessage(err)}`;
  }
  await db.ingestRun.create({
    data: { source, startedAt, finishedAt: new Date(), fetched, inserted, error: error ?? null },
  });
  return { source, fetched, inserted, ...(error ? { error } : {}) };
}

export async function runIngest(
  opts: {
    adapters?: JobSourceAdapter[];
    now?: Date;
    force?: boolean;
    timeoutMs?: number;
    fetchFn?: typeof fetch;
  } = {},
): Promise<IngestReport> {
  const now = opts.now ?? new Date();
  const adapters = opts.adapters ?? getEnabledAdapters();

  // Concurrent, so a slow source cannot starve the others inside the route's time budget.
  const settled = await Promise.allSettled(
    adapters.map((a) =>
      runAdapter(
        a,
        now,
        opts.force ?? false,
        opts.timeoutMs ?? ADAPTER_TIMEOUT_MS,
        opts.fetchFn ?? fetch,
      ),
    ),
  );
  const sources = settled.map((r, i): IngestSourceReport =>
    r.status === "fulfilled"
      ? r.value
      : { source: adapters[i].source, fetched: 0, inserted: 0, error: errorMessage(r.reason) },
  );

  // Jobs the demo template points at never expire, so every new demo gets its full content.
  const demoHashes = templateJobHashes();
  await db.job.updateMany({
    where: { dedupeHash: { in: demoHashes }, source: { not: "MANUAL" } },
    data: { expiresAt: new Date(now.getTime() + JOB_TTL_MS) },
  });
  const { count: expired } = await db.job.deleteMany({
    where: { source: { not: "MANUAL" }, expiresAt: { lt: now }, dedupeHash: { notIn: demoHashes } },
  });
  const demoUsersDeleted = await cleanupExpiredDemoUsers(now);
  return { sources, expired, demoUsersDeleted };
}
