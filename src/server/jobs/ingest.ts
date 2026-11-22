import { Prisma, type JobSource } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { cleanupExpiredDemoUsers } from "@/server/demo/cleanup";
import { templateJobHashes } from "@/server/demo/template";
import { embedBudgetIsShared, embedBudgetPerRun, getEmbedder } from "@/server/embeddings/embedder";
import { toPgVector } from "@/server/embeddings/vector";
import { MAX_BATCH_INPUTS } from "@/server/embeddings/http";
import { computeDedupeHash, getEnabledAdapters } from "./sources";
import type { JobSourceAdapter, NormalizedJob } from "./sources";

export type IngestSourceReport = {
  source: JobSource;
  skipped?: "interval";
  fetched: number;
  inserted: number;
  /** The fetch/store failed. Only this counts against the source's interval. */
  error?: string;
  /** Embedding failed (the jobs are stored and embedded by a later run); kept apart from `error`. */
  embedError?: string;
};

export type IngestReport = {
  sources: IngestSourceReport[];
  expired: number;
  demoUsersDeleted: number;
  /** Embedding the manual jobs without a vector failed. */
  manualEmbedError?: string;
};

export const ADAPTER_TIMEOUT_MS = 25_000;
const JOB_TTL_MS = 30 * 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;

/** 30 days after posting, or the source's own closing date when that comes first. */
const expiryFor = (j: Pick<NormalizedJob, "postedAt" | "expiresAt">, fetchedAt: Date) => {
  const ttl = (j.postedAt ?? fetchedAt).getTime() + JOB_TTL_MS;
  return new Date(Math.min(ttl, j.expiresAt?.getTime() ?? Infinity));
};

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
// Each row carries its description (up to a few KB), so keep a statement to a few hundred rows.
const REFRESH_CHUNK = 200;

/**
 * Bulk-refreshes fetchedAt/expiresAt, the description and the remote scope of known jobs, so formatting fixes
 * reach rows ingested earlier. Rows whose new expiry is already past are left alone. The
 * embedding is not recomputed: the wording is the same, only the layout of the text changes.
 */
async function refreshExisting(
  rows: { hash: string; expiresAt: Date; description: string; remoteScope: string | null }[],
  now: Date,
): Promise<void> {
  const live = rows.filter((r) => r.expiresAt > now);
  for (let i = 0; i < live.length; i += REFRESH_CHUNK) {
    const values = live
      .slice(i, i + REFRESH_CHUNK)
      .map(
        (r) =>
          Prisma.sql`(${r.hash}, ${r.expiresAt.toISOString()}, ${r.description}, ${r.remoteScope})`,
      );
    await db.$executeRaw`UPDATE "Job" AS j SET "fetchedAt" = ${now.toISOString()}::timestamp, "expiresAt" = v.e::timestamp, "description" = v.d, "remoteScope" = v.s FROM (VALUES ${Prisma.join(values)}) AS v(h, e, d, s) WHERE j."dedupeHash" = v.h`;
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
    [...existing].flatMap((hash) => {
      const j = byHash.get(hash);
      return j
        ? [
            {
              hash,
              expiresAt: expiryFor(j, now),
              description: j.description,
              remoteScope: j.remoteScope,
            },
          ]
        : [];
    }),
    now,
  );

  const fresh = [...byHash].filter(([hash, j]) => !existing.has(hash) && expiryFor(j, now) > now);
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
      remoteScope: j.remoteScope,
      description: j.description,
      url: j.url,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      currency: j.currency,
      postedAt: j.postedAt,
      fetchedAt: now,
      expiresAt: expiryFor(j, now),
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
 * How many texts a run may still embed. With a rate-limited provider one budget is shared by all
 * sources and embedding is serialised (`tail`); a provider failure empties it, so the rest of the
 * run does not pile retries onto the route's time limit. Otherwise each source has its own.
 */
type EmbedBudget = { remaining: number; shared: boolean; tail: Promise<unknown> };

function newBudget(shared: boolean): EmbedBudget {
  return { remaining: embedBudgetPerRun(), shared, tail: Promise.resolve() };
}

/**
 * Embeds live jobs of a source (MANUAL included: it has no adapter, only rows whose embedding
 * failed when they were created) that have no vector yet, oldest first, within the budget. One
 * bulk statement per chunk.
 */
function embedMissing(source: JobSource, now: Date, budget: EmbedBudget): Promise<void> {
  if (!budget.shared) return embedMissingNow(source, now, budget);
  const run = budget.tail.then(() => embedMissingNow(source, now, budget));
  budget.tail = run.catch(() => {});
  return run;
}

async function embedMissingNow(source: JobSource, now: Date, budget: EmbedBudget): Promise<void> {
  if (budget.remaining <= 0) return;
  const rows = await db.$queryRaw<EmbedRow[]>`
    SELECT "id", "title", "company", "location", "description" FROM "Job"
    WHERE "source" = ${source}::"JobSource" AND "expiresAt" > ${now.toISOString()}::timestamp AND "embedding" IS NULL
    ORDER BY "fetchedAt" ASC, "id" ASC LIMIT ${budget.remaining}`;
  const embedder = getEmbedder();
  for (let i = 0; i < rows.length; i += EMBED_CHUNK) {
    const chunk = rows.slice(i, i + EMBED_CHUNK);
    let vectors: number[][];
    try {
      vectors = await embedder.embed(chunk.map(embeddingText), "document");
    } catch (err) {
      if (budget.shared) budget.remaining = 0;
      throw err;
    }
    budget.remaining -= chunk.length;
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
  budget: EmbedBudget,
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
  let embedError: string | undefined;
  try {
    const jobs = await fetchWithDeadline(adapter, timeoutMs, baseFetch);
    fetched = jobs.length;
    inserted = await upsertJobs(jobs, now);
  } catch (err) {
    error = errorMessage(err);
  }
  try {
    await embedMissing(source, now, budget);
  } catch (err) {
    // Not the source's error: the fetch worked, and a run recorded with an error would not
    // count for the source's interval.
    embedError = errorMessage(err);
  }
  await db.ingestRun.create({
    data: { source, startedAt, finishedAt: new Date(), fetched, inserted, error: error ?? null },
  });
  return {
    source,
    fetched,
    inserted,
    ...(error ? { error } : {}),
    ...(embedError ? { embedError } : {}),
  };
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

  const shared = embedBudgetIsShared();
  const runBudget = newBudget(shared);
  const budgetFor = () => (shared ? runBudget : newBudget(false));

  // Concurrent, so a slow source cannot starve the others inside the route's time budget.
  const settled = await Promise.allSettled(
    adapters.map((a) =>
      runAdapter(
        a,
        now,
        opts.force ?? false,
        opts.timeoutMs ?? ADAPTER_TIMEOUT_MS,
        opts.fetchFn ?? fetch,
        budgetFor(),
      ),
    ),
  );
  const sources = settled.map((r, i): IngestSourceReport =>
    r.status === "fulfilled"
      ? r.value
      : { source: adapters[i].source, fetched: 0, inserted: 0, error: errorMessage(r.reason) },
  );

  // Manual jobs have no adapter; ones saved without a vector are repaired here, from what is
  // left of the run's budget.
  let manualEmbedError: string | undefined;
  try {
    await embedMissing("MANUAL", now, budgetFor());
  } catch (err) {
    manualEmbedError = errorMessage(err);
  }

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
  return {
    sources,
    expired,
    demoUsersDeleted,
    ...(manualEmbedError ? { manualEmbedError } : {}),
  };
}
