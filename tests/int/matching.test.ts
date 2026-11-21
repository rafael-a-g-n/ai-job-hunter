import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { analyzeCv } from "@/server/cv/analyze";
import { fakeEmbedding } from "@/server/embeddings/fake";
import { toPgVector } from "@/server/embeddings/vector";
import { getMatchForJob, findMatches } from "@/server/matching/match";

const A = "match-user-a";
const B = "match-user-b";
const DAY = 86_400_000;
const noAi = { record: async () => {}, assertBudget: async () => {} };

const FRONTEND = [
  "Frontend Developer",
  "Frontend Engineer",
  "React Frontend Developer",
  "Senior Frontend Engineer",
  "Frontend Developer TypeScript",
];
const OTHER = [
  "Registered Nurse",
  "Head Chef",
  "Truck Driver",
  "Accountant",
  "Warehouse Operative",
  "Dental Hygienist",
  "Civil Engineer",
  "Primary School Teacher",
  "Barista",
  "Electrician",
];

async function makeJob(title: string, over: { ownerId?: string; remote?: boolean } = {}) {
  const description =
    FRONTEND.includes(title) || over.ownerId
      ? `${title} role: build the web app with React, TypeScript and CSS, with git and teamwork.`
      : `${title} role: daily duties of a ${title} in a busy workplace.`;
  const job = await db.job.create({
    data: {
      source: over.ownerId ? "MANUAL" : "ARBEITNOW",
      dedupeHash: `h-${title}-${over.ownerId ?? "pub"}`,
      title,
      company: "Acme",
      description,
      remote: over.remote ?? false,
      ownerId: over.ownerId ?? null,
      expiresAt: new Date(Date.now() + 30 * DAY),
    },
  });
  const vec = toPgVector(fakeEmbedding(`${title}\n${description}`));
  await db.$executeRaw`UPDATE "Job" SET "embedding" = ${vec}::vector WHERE "id" = ${job.id}`;
  return job;
}

async function analysedCv(userId = A) {
  const cv = await db.cv.create({
    data: {
      userId,
      fileName: "cv.pdf",
      blobKey: `cv/${userId}/k`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      rawText: "Ana Silva Frontend Developer React TypeScript ".repeat(10),
      isActive: true,
    },
  });
  await analyzeCv(userId, cv.id, "en", noAi);
  return cv;
}

async function seedAll() {
  for (const t of [...FRONTEND, ...OTHER]) await makeJob(t);
}

const usageCount = async (userId = A) =>
  (await db.usageCounter.findFirst({ where: { userId, action: "MATCH_RERANK" } }))?.count ?? 0;

const failingModel = () =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: "not json" }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });

const fixedModel = (results: unknown[]) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: JSON.stringify({ results }) }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });

beforeEach(async () => {
  for (const id of [A, B]) {
    await db.user.create({ data: { id, name: id, email: `${id}@example.com` } });
  }
});

describe("findMatches", () => {
  it("recalls the frontend jobs first and re-ranks the top 10 with the mock scores", async () => {
    await seedAll();
    await analysedCv();
    const { matches, rerankStatus } = await findMatches(A, false);
    expect(matches).toHaveLength(15);

    const byVector = [...matches].sort((a, b) => b.vectorScore - a.vectorScore).slice(0, 5);
    expect(byVector.every((m) => FRONTEND.includes(m.job.title))).toBe(true);

    const ranked = matches.filter((m) => m.score !== null);
    expect(ranked).toHaveLength(10);
    expect(matches.slice(0, 10).every((m) => m.score !== null)).toBe(true);
    expect(matches[0].score).toBe(88);
    expect(matches[0].matchedSkills).toEqual(["React", "TypeScript"]);
    expect(matches[0].gaps).toEqual(["GraphQL"]);
    expect(matches[0].explanation).toContain("frontend");
    const scores = ranked.map((m) => m.score ?? 0);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(matches.slice(10).every((m) => m.score === null)).toBe(true);
    expect(rerankStatus).toBe("ok");
    expect(await usageCount()).toBe(1);
  });

  it("serves a second call from the cache: no AI call, no usage", async () => {
    await seedAll();
    await analysedCv();
    const { matches: first } = await findMatches(A, false);
    const callsBefore = await db.aiCall.count({ where: { purpose: "matching.rerank" } });
    expect(callsBefore).toBe(1);

    const { matches: second } = await findMatches(A, false);
    expect(await db.aiCall.count({ where: { purpose: "matching.rerank" } })).toBe(callsBefore);
    expect(await usageCount()).toBe(1);
    expect(second.map((m) => [m.job.id, m.score])).toEqual(first.map((m) => [m.job.id, m.score]));
  });

  it("ignores a result for a job id that was not sent", async () => {
    await seedAll();
    await analysedCv();
    const [real] = await db.job.findMany({ where: { title: "Frontend Developer" } });
    const model = fixedModel([
      { jobId: "ghost-id", score: 99, matchedSkills: [], gaps: [], explanation: "x" },
      { jobId: real.id, score: 70, matchedSkills: ["React"], gaps: [], explanation: "ok" },
    ]);
    const { matches } = await findMatches(A, false, {}, { ...noAi, model });
    expect(matches[0]).toMatchObject({ score: 70 });
    expect(matches.filter((m) => m.score !== null)).toHaveLength(1);
    expect(await db.matchResult.count({ where: { score: { not: null } } })).toBe(1);
    expect(await db.matchResult.count({ where: { jobId: "ghost-id" } })).toBe(0);
  });

  it("records jobs left out of the answer as attempted and never sends them again", async () => {
    await seedAll();
    await analysedCv();
    const [real] = await db.job.findMany({ where: { title: "Frontend Developer" } });
    const model = fixedModel([
      { jobId: real.id, score: 70, matchedSkills: ["React"], gaps: [], explanation: "ok" },
    ]);
    await findMatches(A, false, {}, { ...noAi, model });
    const attempted = await db.matchResult.findMany({ where: { rerankedAt: { not: null } } });
    expect(attempted).toHaveLength(10);
    expect(attempted.filter((m) => m.score === null)).toHaveLength(9);

    const again = await findMatches(A, false, {}, { ...noAi, model });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(again.rerankStatus).toBe("ok");
    expect(await usageCount()).toBe(1);
  });

  it("rounds a non-integer score instead of failing the re-rank", async () => {
    await seedAll();
    await analysedCv();
    const [real] = await db.job.findMany({ where: { title: "Frontend Developer" } });
    const model = fixedModel([
      { jobId: real.id, score: 87.6, matchedSkills: [], gaps: [], explanation: "ok" },
    ]);
    const { matches, rerankStatus } = await findMatches(A, false, {}, { ...noAi, model });
    expect(rerankStatus).toBe("ok");
    expect(matches[0]).toMatchObject({ score: 88 });
  });

  it("pauses the re-rank for 10 minutes after an AI failure", async () => {
    await seedAll();
    const cv = await analysedCv();
    const model = failingModel();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await findMatches(A, false, {}, { ...noAi, model })).rerankStatus).toBe("failed");
      expect(model.doGenerateCalls).toHaveLength(2);
      // Within the cooldown: no AI call at all.
      expect((await findMatches(A, false, {}, { ...noAi, model })).rerankStatus).toBe("failed");
      expect(model.doGenerateCalls).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
    await db.cv.update({
      where: { id: cv.id },
      data: { rerankFailedAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    const after = await findMatches(A, false, {}, noAi);
    expect(after.rerankStatus).toBe("ok");
    expect(after.matches.some((m) => m.score !== null)).toBe(true);
    expect(await usageCount()).toBe(1);
  });

  it("returns vector-only results and refunds usage when the AI fails", async () => {
    await seedAll();
    await analysedCv();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { matches, rerankStatus } = await findMatches(
      A,
      false,
      {},
      {
        ...noAi,
        model: failingModel(),
      },
    );
    spy.mockRestore();
    expect(rerankStatus).toBe("failed");
    expect(matches).toHaveLength(15);
    expect(matches.every((m) => m.score === null)).toBe(true);
    const sims = matches.map((m) => m.vectorScore);
    expect(sims).toEqual([...sims].sort((a, b) => b - a));
    expect(await usageCount()).toBe(0);
    expect(await db.matchResult.count()).toBe(0);
  });

  it("returns vector-only results when the daily limit is reached", async () => {
    await seedAll();
    await analysedCv();
    await db.$executeRaw`INSERT INTO "UsageCounter" ("userId","action","day","count") VALUES (${A}, 'MATCH_RERANK', (now() AT TIME ZONE 'UTC')::date, 10)`;
    const { matches, rerankStatus } = await findMatches(A, false, {}, noAi);
    expect(rerankStatus).toBe("limit");
    expect(matches).toHaveLength(15);
    expect(matches.every((m) => m.score === null)).toBe(true);
    expect(await usageCount()).toBe(10);
  });

  it("never returns another user's manual jobs", async () => {
    await seedAll();
    await makeJob("Frontend Developer Secret", { ownerId: B });
    await makeJob("Frontend Developer Mine", { ownerId: A });
    await analysedCv();
    const titles = (await findMatches(A, false)).matches.map((m) => m.job.title);
    expect(titles).toContain("Frontend Developer Mine");
    expect(titles).not.toContain("Frontend Developer Secret");
  });

  it("applies the remote filter", async () => {
    await seedAll();
    await makeJob("Remote Frontend Developer", { remote: true });
    await analysedCv();
    const { matches } = await findMatches(A, false, { filters: { remote: true } }, noAi);
    expect(matches.map((m) => m.job.title)).toEqual(["Remote Frontend Developer"]);
  });

  it("throws CV_NOT_READY without an analysed CV", async () => {
    await expect(findMatches(A, false)).rejects.toMatchObject({ code: "CV_NOT_READY" });
    await db.cv.create({
      data: {
        userId: A,
        fileName: "cv.pdf",
        blobKey: "k",
        mimeType: "application/pdf",
        sizeBytes: 1,
        isActive: true,
        status: "UPLOADED",
      },
    });
    await expect(findMatches(A, false)).rejects.toBeInstanceOf(AppError);
    expect(await usageCount()).toBe(0);
  });

  it("refuses another user's CV id", async () => {
    const cv = await analysedCv(B);
    await expect(findMatches(A, false, { cvId: cv.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getMatchForJob", () => {
  it("returns the cached match without any AI call, and null for other users", async () => {
    await seedAll();
    await analysedCv();
    await analysedCv(B);
    const { matches } = await findMatches(A, false);
    const top = matches[0];
    const calls = await db.aiCall.count();

    const cached = await getMatchForJob(A, top.job.id);
    expect(cached).toMatchObject({ score: top.score, explanation: top.explanation });
    expect(cached?.job.id).toBe(top.job.id);
    expect(await db.aiCall.count()).toBe(calls);

    expect(await getMatchForJob(B, top.job.id)).toBeNull();
  });

  it("returns null for a job that has no cached match", async () => {
    await seedAll();
    await analysedCv();
    const job = await db.job.findFirstOrThrow();
    expect(await getMatchForJob(A, job.id)).toBeNull();
  });

  it("hides a match for another user's manual job", async () => {
    await analysedCv();
    const cv = await db.cv.findFirstOrThrow({ where: { userId: A } });
    const secret = await makeJob("Frontend Developer Secret", { ownerId: B });
    await db.matchResult.create({
      data: { cvId: cv.id, jobId: secret.id, vectorScore: 0.5, score: 80 },
    });
    expect(await getMatchForJob(A, secret.id)).toBeNull();
  });
});
