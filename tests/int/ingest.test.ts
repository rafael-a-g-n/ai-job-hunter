import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobSource } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { POST } from "@/app/api/cron/ingest/route";
import { templateJobHashes } from "@/server/demo/template";
import { runIngest } from "@/server/jobs/ingest";
import type { JobSourceAdapter, NormalizedJob } from "@/server/jobs/sources";

let adapters: JobSourceAdapter[] = [];
// The route calls runIngest() with the enabled adapters: keep it off the network.
vi.mock("@/server/jobs/sources/index", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/jobs/sources")>()),
  getEnabledAdapters: () => adapters,
}));

let embedFails = false;
vi.mock("@/server/embeddings/embedder", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/server/embeddings/embedder")>();
  return {
    ...orig,
    getEmbedder: () => {
      if (embedFails) {
        return {
          embed: async () => {
            throw new Error("voyage down");
          },
        };
      }
      return orig.getEmbedder();
    },
  };
});

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;

const job = (n: number, over: Partial<NormalizedJob> = {}): NormalizedJob => ({
  source: "ARBEITNOW",
  externalId: `ext-${n}`,
  title: `Engineer ${n}`,
  company: `Company ${n}`,
  location: "Berlin",
  remote: false,
  description: `Build things ${n}`,
  url: `https://example.com/${n}`,
  salaryMin: null,
  salaryMax: null,
  currency: null,
  postedAt: new Date(),
  ...over,
});

const adapter = (
  source: JobSource,
  fetchJobs: JobSourceAdapter["fetchJobs"],
  minIntervalHours = 6,
): JobSourceAdapter => ({ source, minIntervalHours, fetchJobs });

const staticAdapter = (source: JobSource, jobs: NormalizedJob[], minIntervalHours = 6) =>
  adapter(source, async () => jobs.map((j) => ({ ...j, source })), minIntervalHours);

const embeddedCount = async () =>
  Number(
    (
      await db.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM "Job" WHERE "embedding" IS NOT NULL`
    )[0].n,
  );

afterEach(() => {
  embedFails = false;
  vi.restoreAllMocks();
});

describe("runIngest", () => {
  it("repairs jobs left without an embedding by a failed run", async () => {
    const a = staticAdapter("ARBEITNOW", [job(1), job(2)]);
    embedFails = true;
    const first = await runIngest({ adapters: [a] });
    expect(first.sources[0]).toMatchObject({ inserted: 2 });
    expect(first.sources[0].error).toMatch(/voyage down/);
    expect(await db.job.count()).toBe(2);
    expect(await embeddedCount()).toBe(0);

    embedFails = false;
    const second = await runIngest({ adapters: [a], force: true });
    expect(second.sources[0]).toMatchObject({ inserted: 0 });
    expect(second.sources[0].error).toBeUndefined();
    expect(await embeddedCount()).toBe(2);
  });

  it("refreshes many existing jobs in bulk, without per-row updates", async () => {
    const jobs = Array.from({ length: 60 }, (_, i) => job(i + 1));
    const a = staticAdapter("ARBEITNOW", jobs);
    await runIngest({ adapters: [a], now: new Date(Date.now() - 2 * DAY) });
    const update = vi.spyOn(db.job, "update");
    const now = new Date();
    const report = await runIngest({ adapters: [a], now, force: true });
    expect(report.sources[0]).toMatchObject({ fetched: 60, inserted: 0 });
    expect(update).not.toHaveBeenCalled();
    const rows = await db.job.findMany();
    expect(rows).toHaveLength(60);
    expect(rows.every((r) => r.fetchedAt.getTime() === now.getTime())).toBe(true);
  });

  it("passes the injected fetch through to adapters", async () => {
    const fake = vi.fn(async () => new Response("{}"));
    const a = adapter("ARBEITNOW", async (f) => {
      await f?.("http://example.test/x");
      return [];
    });
    await runIngest({ adapters: [a], fetchFn: fake as unknown as typeof fetch });
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("inserts new jobs with embeddings", async () => {
    const report = await runIngest({
      adapters: [staticAdapter("ARBEITNOW", [job(1), job(2), job(3)])],
    });
    expect(report.sources).toEqual([{ source: "ARBEITNOW", fetched: 3, inserted: 3 }]);
    expect(await db.job.count()).toBe(3);
    expect(await embeddedCount()).toBe(3);
    const run = await db.ingestRun.findFirstOrThrow();
    expect(run).toMatchObject({ source: "ARBEITNOW", fetched: 3, inserted: 3, error: null });
    expect(run.finishedAt).not.toBeNull();
  });

  it("inserts nothing on a repeat run and refreshes fetchedAt", async () => {
    const a = staticAdapter("ARBEITNOW", [job(1), job(2)]);
    await runIngest({ adapters: [a], now: new Date(Date.now() - 2 * DAY) });
    const before = (await db.job.findFirstOrThrow()).fetchedAt;
    const now = new Date();
    const report = await runIngest({ adapters: [a], now, force: true });
    expect(report.sources[0]).toMatchObject({ fetched: 2, inserted: 0 });
    expect(await db.job.count()).toBe(2);
    const after = await db.job.findFirstOrThrow();
    expect(after.fetchedAt.getTime()).toBe(now.getTime());
    expect(after.fetchedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("dedupes identical jobs within one fetch", async () => {
    const report = await runIngest({ adapters: [staticAdapter("ARBEITNOW", [job(1), job(1)])] });
    expect(report.sources[0].inserted).toBe(1);
    expect(await db.job.count()).toBe(1);
  });

  it("keeps ingesting other sources when one adapter throws", async () => {
    const bad = adapter("ADZUNA", async () => {
      throw new Error("Adzuna request failed: 429");
    });
    const good = staticAdapter("ARBEITNOW", [job(1), job(2)]);
    const report = await runIngest({ adapters: [bad, good] });
    expect(report.sources[0]).toMatchObject({
      source: "ADZUNA",
      inserted: 0,
      error: "Adzuna request failed: 429",
    });
    expect(report.sources[1]).toMatchObject({ source: "ARBEITNOW", inserted: 2 });
    expect(report.sources[1].error).toBeUndefined();
    expect(await db.job.count()).toBe(2);
    const run = await db.ingestRun.findFirstOrThrow({ where: { source: "ADZUNA" } });
    expect(run.error).toContain("429");
  });

  it("turns a non-Error rejection into that source's error", async () => {
    const weird = adapter("ADZUNA", () =>
      Promise.reject(new DOMException("aborted", "TimeoutError")),
    );
    const report = await runIngest({ adapters: [weird] });
    expect(report.sources[0].error).toBe("aborted");
  });

  it("reports a source that exceeds the deadline as an error without blocking the others", async () => {
    const hang = adapter("ADZUNA", () => new Promise<NormalizedJob[]>(() => {}));
    const good = staticAdapter("ARBEITNOW", [job(1)]);
    const report = await runIngest({ adapters: [hang, good], timeoutMs: 100 });
    expect(report.sources[0].error).toMatch(/timed out/);
    expect(report.sources[1]).toMatchObject({ inserted: 1 });
  });

  it("skips a source within its interval unless forced", async () => {
    let calls = 0;
    const remotive = adapter(
      "REMOTIVE",
      async () => {
        calls++;
        return [job(calls, { source: "REMOTIVE" })];
      },
      24,
    );
    const t0 = new Date();
    await runIngest({ adapters: [remotive], now: t0 });
    const within = await runIngest({
      adapters: [remotive],
      now: new Date(t0.getTime() + 6 * HOUR),
    });
    expect(within.sources[0]).toEqual({
      source: "REMOTIVE",
      skipped: "interval",
      fetched: 0,
      inserted: 0,
    });
    expect(calls).toBe(1);

    await runIngest({ adapters: [remotive], now: new Date(t0.getTime() + 6 * HOUR), force: true });
    expect(calls).toBe(2);

    const later = await runIngest({
      adapters: [remotive],
      now: new Date(t0.getTime() + 25 * HOUR),
    });
    expect(later.sources[0].skipped).toBeUndefined();
    expect(calls).toBe(3);
  });

  it("does not let a failed run block a retry inside the interval", async () => {
    let calls = 0;
    const flaky = adapter(
      "REMOTIVE",
      async () => {
        calls++;
        if (calls === 1) throw new Error("Remotive request failed: 503");
        return [job(1, { source: "REMOTIVE" })];
      },
      24,
    );
    await runIngest({ adapters: [flaky] });
    const retry = await runIngest({ adapters: [flaky] });
    expect(retry.sources[0]).toMatchObject({ inserted: 1 });
    expect(calls).toBe(2);
  });

  it("deletes expired non-manual jobs but never manual ones", async () => {
    await db.user.create({ data: { id: "u1", name: "U", email: "u@example.com" } });
    const old = new Date(Date.now() - 31 * DAY);
    const base = {
      description: "d",
      company: "C",
      fetchedAt: old,
      expiresAt: new Date(old.getTime() + 30 * DAY),
    };
    await db.job.create({
      data: { ...base, source: "ARBEITNOW", dedupeHash: "old-public", title: "Old" },
    });
    await db.job.create({
      data: { ...base, source: "MANUAL", ownerId: "u1", dedupeHash: "old-manual", title: "Mine" },
    });
    const report = await runIngest({ adapters: [] });
    expect(report.expired).toBe(1);
    expect((await db.job.findMany()).map((j) => j.dedupeHash)).toEqual(["old-manual"]);
  });

  it("never expires a job the demo template points at, and extends its expiry", async () => {
    const [hash] = templateJobHashes();
    const old = new Date(Date.now() - 31 * DAY);
    await db.job.create({
      data: {
        source: "ARBEITNOW",
        dedupeHash: hash,
        title: "Demo job",
        company: "C",
        description: "d",
        fetchedAt: old,
        expiresAt: new Date(old.getTime() + 30 * DAY),
      },
    });
    const report = await runIngest({ adapters: [] });
    expect(report.expired).toBe(0);
    const kept = await db.job.findUniqueOrThrow({ where: { dedupeHash: hash } });
    expect(kept.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  it("does not keep a fetched job that is already past its 30 day expiry", async () => {
    const stale = job(1, { postedAt: new Date(Date.now() - 31 * DAY) });
    const report = await runIngest({ adapters: [staticAdapter("ARBEITNOW", [stale, job(2)])] });
    expect(report.sources[0]).toMatchObject({ fetched: 2, inserted: 1 });
    expect(await db.job.count()).toBe(1);
  });
});

describe("POST /api/cron/ingest", () => {
  const call = (headers: Record<string, string> = {}) =>
    POST(new Request("http://localhost/api/cron/ingest", { method: "POST", headers }));

  it("returns 401 without a valid secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer nope" })).status).toBe(401);
    expect((await call({ authorization: "test-cron-secret" })).status).toBe(401);
  });

  it("returns 200 with the source's error when an adapter fails", async () => {
    const failing = adapter("ADZUNA", async () => {
      throw new Error("Adzuna request failed: 503");
    });
    adapters = [failing];
    const res = await call({ authorization: "Bearer test-cron-secret" });
    adapters = [];
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sources: { source: string; error?: string }[] };
    expect(body.sources).toEqual([
      { source: "ADZUNA", fetched: 0, inserted: 0, error: "Adzuna request failed: 503" },
    ]);
  });

  it("returns 200 and the report with the secret", async () => {
    const res = await call({ authorization: "Bearer test-cron-secret" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sources: [], expired: 0, demoUsersDeleted: 0 });
  });
});
