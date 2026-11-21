import type { JobSource } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { cleanupExpiredDemoUsers } from "@/server/demo/cleanup";
import { getEmbedder } from "@/server/embeddings/embedder";
import { toPgVector } from "@/server/embeddings/vector";
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
): Promise<NormalizedJob[]> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const fetchFn: typeof fetch = (input, init) =>
    fetch(input, {
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

function embeddingText(j: {
  title: string;
  company: string;
  location: string | null;
  description: string;
}) {
  return [j.title, j.company, j.location ?? "", j.description.slice(0, 2000)].join("\n");
}

async function ingestJobs(jobs: NormalizedJob[], now: Date): Promise<number> {
  const byHash = new Map<string, NormalizedJob>();
  for (const j of jobs) byHash.set(computeDedupeHash(j), j);
  const hashes = [...byHash.keys()];
  if (hashes.length === 0) return 0;

  const existing = new Set(
    (
      await db.job.findMany({ where: { dedupeHash: { in: hashes } }, select: { dedupeHash: true } })
    ).map((j) => j.dedupeHash),
  );

  for (const hash of existing) {
    const j = byHash.get(hash);
    if (!j) continue;
    await db.job.update({
      where: { dedupeHash: hash },
      data: { fetchedAt: now, expiresAt: expiryFor(j.postedAt, now) },
    });
  }

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
    select: { id: true, title: true, company: true, location: true, description: true },
  });

  const vectors = await getEmbedder().embed(created.map(embeddingText), "document");
  for (const [i, job] of created.entries()) {
    await db.$executeRaw`UPDATE "Job" SET "embedding" = ${toPgVector(vectors[i])}::vector WHERE "id" = ${job.id}`;
  }
  return created.length;
}

async function runAdapter(
  adapter: JobSourceAdapter,
  now: Date,
  force: boolean,
  timeoutMs: number,
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
    const jobs = await fetchWithDeadline(adapter, timeoutMs);
    fetched = jobs.length;
    inserted = await ingestJobs(jobs, now);
  } catch (err) {
    error = errorMessage(err);
  }
  await db.ingestRun.create({
    data: { source, startedAt, finishedAt: new Date(), fetched, inserted, error: error ?? null },
  });
  return { source, fetched, inserted, ...(error ? { error } : {}) };
}

export async function runIngest(
  opts: { adapters?: JobSourceAdapter[]; now?: Date; force?: boolean; timeoutMs?: number } = {},
): Promise<IngestReport> {
  const now = opts.now ?? new Date();
  const adapters = opts.adapters ?? getEnabledAdapters();

  // Concurrent, so a slow source cannot starve the others inside the route's time budget.
  const settled = await Promise.allSettled(
    adapters.map((a) =>
      runAdapter(a, now, opts.force ?? false, opts.timeoutMs ?? ADAPTER_TIMEOUT_MS),
    ),
  );
  const sources = settled.map((r, i): IngestSourceReport =>
    r.status === "fulfilled"
      ? r.value
      : { source: adapters[i].source, fetched: 0, inserted: 0, error: errorMessage(r.reason) },
  );

  const { count: expired } = await db.job.deleteMany({
    where: { source: { not: "MANUAL" }, expiresAt: { lt: now } },
  });
  const demoUsersDeleted = await cleanupExpiredDemoUsers(now);
  return { sources, expired, demoUsersDeleted };
}
