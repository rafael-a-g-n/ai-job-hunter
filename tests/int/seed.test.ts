import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DemoTemplate, loadDemoTemplate } from "@/server/demo/template";
import { seedJobs } from "@/server/demo/seed-jobs";

const nonExpiredWithEmbedding = async () =>
  Number(
    (
      await db.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM "Job" WHERE "embedding" IS NOT NULL AND "expiresAt" > now()`
    )[0].n,
  );

describe("seedJobs", () => {
  it("creates at least 30 non-expired jobs, all with embeddings", async () => {
    const count = await seedJobs(db);
    expect(count).toBeGreaterThanOrEqual(30);
    expect(await db.job.count()).toBe(count);
    expect(await nonExpiredWithEmbedding()).toBe(count);
  });

  it("is idempotent", async () => {
    const first = await seedJobs(db);
    await seedJobs(db);
    expect(await db.job.count()).toBe(first);
    expect(await nonExpiredWithEmbedding()).toBe(first);
  });

  it("keeps the seeded jobs alive for about 30 days", async () => {
    await seedJobs(db);
    const soonest = await db.job.findFirstOrThrow({ orderBy: { expiresAt: "asc" } });
    expect(soonest.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);
  });

  it("includes React/TypeScript frontend roles in Lisbon, Porto and remote", async () => {
    await seedJobs(db);
    const frontend = await db.job.findMany({ where: { title: { contains: "Frontend" } } });
    expect(frontend.some((j) => /lisboa/i.test(j.location ?? ""))).toBe(true);
    expect(frontend.some((j) => /porto/i.test(j.location ?? ""))).toBe(true);
    expect(frontend.some((j) => j.remote)).toBe(true);
  });
});

describe("demo template", () => {
  const raw = () =>
    JSON.parse(
      readFileSync(path.resolve(process.cwd(), "src/server/demo/template-data.json"), "utf8"),
    ) as unknown;

  it("template-data.json parses against the DemoTemplate schema", () => {
    expect(DemoTemplate.safeParse(raw()).success).toBe(true);
    const t = loadDemoTemplate();
    expect(t.savedJobDedupeHashes).toHaveLength(3);
    expect(t.savedJobDedupeHashes).toContain(t.letter.jobDedupeHash);
  });

  it("holds the sample CV as a base64 PDF", () => {
    const { blob } = loadDemoTemplate().cv;
    expect(Buffer.from(blob, "base64").subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("only references jobs that the seed creates", async () => {
    await seedJobs(db);
    const t = loadDemoTemplate();
    const found = await db.job.findMany({
      where: { dedupeHash: { in: t.savedJobDedupeHashes } },
      select: { dedupeHash: true },
    });
    expect(found).toHaveLength(t.savedJobDedupeHashes.length);
  });

  it("rejects a letter for a job that is not among the saved jobs", () => {
    const bad = { ...(raw() as object), savedJobDedupeHashes: ["a", "b", "c"] };
    expect(DemoTemplate.safeParse(bad).success).toBe(false);
  });
});
