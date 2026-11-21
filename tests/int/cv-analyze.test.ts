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
