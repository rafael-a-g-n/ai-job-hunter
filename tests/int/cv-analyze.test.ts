import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AppError, LimitExceededError, NotFoundError } from "@/lib/errors";
import { MOCK_FIXTURES } from "@/server/ai/mock";
import { analyzeCv, updateCvProfile } from "@/server/cv/analyze";
import { getActiveCv, getCv, listCvs } from "@/server/cv/queries";
import type { CvAnalysisResult } from "@/server/cv/schemas";

const UID = "analyze-user";
const noAi = { record: async () => {}, assertBudget: async () => {} };
const profile = () => (structuredClone(MOCK_FIXTURES["cv.analysis"]) as CvAnalysisResult).profile;

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

async function makeCv(userId = UID, status: "UPLOADED" | "FAILED" | "ANALYZING" = "UPLOADED") {
  return db.cv.create({
    data: {
      userId,
      fileName: "cv.pdf",
      blobKey: `cv/${userId}/k`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      rawText: "Ana Silva Frontend Developer React TypeScript ".repeat(10),
      status,
      isActive: true,
    },
  });
}
const usageCount = async (userId = UID) =>
  (await db.usageCounter.findFirst({ where: { userId, action: "CV_ANALYSIS" } }))?.count ?? 0;
const embeddingSet = async (id: string) =>
  (
    await db.$queryRaw<
      { ok: boolean }[]
    >`SELECT ("embedding" IS NOT NULL) AS ok FROM "Cv" WHERE "id" = ${id}`
  )[0].ok;
const embeddingText = async (id: string) =>
  (
    await db.$queryRaw<{ e: string }[]>`SELECT "embedding"::text AS e FROM "Cv" WHERE "id" = ${id}`
  )[0].e;

beforeEach(async () => {
  await db.user.create({ data: { id: UID, name: "A", email: "a@example.com" } });
});

describe("analyzeCv", () => {
  it("analyses a CV: status, profile, embedding and one usage unit", async () => {
    const cv = await makeCv();
    const result = await analyzeCv(UID, cv.id, "en", noAi);
    expect(result.status).toBe("ANALYZED");
    expect(result.profile).toMatchObject({ fullName: "Ana Silva" });
    expect(result.analysis).toMatchObject({ overallScore: 78 });
    expect(await embeddingSet(cv.id)).toBe(true);
    expect(await usageCount()).toBe(1);
  });

  it("marks the CV FAILED and refunds usage when the AI fails", async () => {
    const cv = await makeCv();
    await expect(
      analyzeCv(UID, cv.id, "en", { ...noAi, model: failingModel() }),
    ).rejects.toBeInstanceOf(AppError);
    const after = await getCv(UID, cv.id);
    expect(after.status).toBe("FAILED");
    expect(after.failureReason).toBe("The AI service failed. Please try again.");
    expect(await usageCount()).toBe(0);
  });

  it("gives another user's CV a NotFoundError and consumes nothing", async () => {
    await db.user.create({ data: { id: "b", name: "B", email: "b@example.com" } });
    const cv = await makeCv();
    await expect(analyzeCv("b", cv.id, "en", noAi)).rejects.toBeInstanceOf(NotFoundError);
    expect(await usageCount("b")).toBe(0);
    expect((await getCv(UID, cv.id)).status).toBe("UPLOADED");
  });

  it("rejects the 4th analysis in a day", async () => {
    const cv = await makeCv();
    for (let i = 0; i < 3; i++) await analyzeCv(UID, cv.id, "en", noAi);
    await expect(analyzeCv(UID, cv.id, "en", noAi)).rejects.toBeInstanceOf(LimitExceededError);
    expect(await usageCount()).toBe(3);
  });

  it("rejects FAILED and ANALYZING CVs with CV_NOT_READY and no usage", async () => {
    for (const status of ["FAILED", "ANALYZING"] as const) {
      const cv = await makeCv(UID, status);
      await expect(analyzeCv(UID, cv.id, "en", noAi)).rejects.toMatchObject({
        code: "CV_NOT_READY",
      });
    }
    expect(await usageCount()).toBe(0);
  });
});

describe("updateCvProfile", () => {
  it("changes the embedding and leaves usage unchanged", async () => {
    const cv = await makeCv();
    await analyzeCv(UID, cv.id, "en", noAi);
    const before = await embeddingText(cv.id);
    const edited = profile();
    edited.skills.push({ name: "GraphQL", category: "technical", level: 3 });
    const updated = await updateCvProfile(UID, cv.id, edited);
    expect((updated.profile as { skills: unknown[] }).skills).toHaveLength(6);
    expect(await embeddingText(cv.id)).not.toBe(before);
    expect(await usageCount()).toBe(1);
  });

  it("rejects an invalid profile and another user's CV", async () => {
    const cv = await makeCv();
    await analyzeCv(UID, cv.id, "en", noAi);
    await expect(
      updateCvProfile(UID, cv.id, { ...profile(), seniority: "guru" as never }),
    ).rejects.toThrow();
    await db.user.create({ data: { id: "b", name: "B", email: "b@example.com" } });
    await expect(updateCvProfile("b", cv.id, profile())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("cv queries", () => {
  it("scope by user", async () => {
    await db.user.create({ data: { id: "b", name: "B", email: "b@example.com" } });
    const cv = await makeCv();
    await expect(getCv("b", cv.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await getActiveCv("b")).toBeNull();
    expect(await listCvs("b")).toEqual([]);
    expect((await getActiveCv(UID))?.id).toBe(cv.id);
    expect(await listCvs(UID)).toHaveLength(1);
  });
});

describe("activation and recovery", () => {
  const isActive = async (id: string) => (await getCv(UID, id)).isActive;

  it("activates the new CV and deactivates the old one only after analysis succeeds", async () => {
    const old = await makeCv();
    await analyzeCv(UID, old.id, "en", noAi);
    const next = await db.cv.create({
      data: {
        userId: UID,
        fileName: "new.pdf",
        blobKey: "cv/k2",
        mimeType: "application/pdf",
        sizeBytes: 10,
        rawText: "Ana Silva Frontend Developer ".repeat(10),
        isActive: false,
      },
    });
    // Analysis fails: the old CV stays active.
    await expect(
      analyzeCv(UID, next.id, "en", { ...noAi, model: failingModel() }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await isActive(old.id)).toBe(true);
    expect(await isActive(next.id)).toBe(false);
    // Limit reached: the old CV stays active.
    await db.cv.update({ where: { id: next.id }, data: { status: "UPLOADED" } });
    await db.usageCounter.updateMany({ data: { count: 3 } });
    await expect(analyzeCv(UID, next.id, "en", noAi)).rejects.toBeInstanceOf(LimitExceededError);
    expect(await isActive(old.id)).toBe(true);
    // Success: the new CV becomes the only active one.
    await db.cv.update({ where: { id: next.id }, data: { status: "UPLOADED" } });
    await db.usageCounter.updateMany({ data: { count: 0 } });
    await analyzeCv(UID, next.id, "en", noAi);
    expect(await isActive(next.id)).toBe(true);
    expect(await isActive(old.id)).toBe(false);
  });

  it("restores ANALYZED with the existing analysis when a re-analysis fails", async () => {
    const cv = await makeCv();
    const first = await analyzeCv(UID, cv.id, "en", noAi);
    const before = await embeddingText(cv.id);
    await expect(
      analyzeCv(UID, cv.id, "en", { ...noAi, model: failingModel() }),
    ).rejects.toBeInstanceOf(AppError);
    const after = await getCv(UID, cv.id);
    expect(after.status).toBe("ANALYZED");
    expect(after.failureReason).toBeNull();
    expect(after.profile).toEqual(first.profile);
    expect(after.analysis).toEqual(first.analysis);
    expect(await embeddingText(cv.id)).toBe(before);
    expect(await usageCount()).toBe(1);
  });

  it("reclaims an ANALYZING CV whose claim is older than 5 minutes", async () => {
    const cv = await makeCv(UID, "ANALYZING");
    await db.$executeRaw`UPDATE "Cv" SET "updatedAt" = now() - interval '6 minutes' WHERE "id" = ${cv.id}`;
    const result = await analyzeCv(UID, cv.id, "en", noAi);
    expect(result.status).toBe("ANALYZED");
    expect(await usageCount()).toBe(1);
  });

  it("does not reclaim a fresh ANALYZING CV", async () => {
    const cv = await makeCv(UID, "ANALYZING");
    await expect(analyzeCv(UID, cv.id, "en", noAi)).rejects.toMatchObject({
      code: "CV_NOT_READY",
    });
  });
});

describe("cached match invalidation", () => {
  const DAY = 86_400_000;

  async function seedMatches() {
    const cv = await makeCv();
    await analyzeCv(UID, cv.id, "en", noAi);
    await db.user.create({ data: { id: "b", name: "B", email: "b@example.com" } });
    const other = await makeCv("b");
    const job = await db.job.create({
      data: {
        source: "ARBEITNOW",
        dedupeHash: "inv-job",
        title: "Frontend Engineer",
        company: "Lisbon Labs",
        description: "React",
        expiresAt: new Date(Date.now() + 30 * DAY),
      },
    });
    for (const cvId of [cv.id, other.id]) {
      await db.matchResult.create({
        data: { cvId, jobId: job.id, vectorScore: 0.8, score: 90, matchedSkills: [], gaps: [] },
      });
    }
    return { cv, other };
  }
  const matchCount = (cvId: string) => db.matchResult.count({ where: { cvId } });

  it("a successful re-analysis drops the CV's cached matches, and only those", async () => {
    const { cv, other } = await seedMatches();
    await analyzeCv(UID, cv.id, "en", noAi);
    expect(await matchCount(cv.id)).toBe(0);
    expect(await matchCount(other.id)).toBe(1);
  });

  it("a failed re-analysis keeps the cached matches", async () => {
    const { cv } = await seedMatches();
    await expect(
      analyzeCv(UID, cv.id, "en", { ...noAi, model: failingModel() }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await matchCount(cv.id)).toBe(1);
  });

  it("a profile edit drops the CV's cached matches, and only those", async () => {
    const { cv, other } = await seedMatches();
    await updateCvProfile(UID, cv.id, profile());
    expect(await matchCount(cv.id)).toBe(0);
    expect(await matchCount(other.id)).toBe(1);
  });
});
