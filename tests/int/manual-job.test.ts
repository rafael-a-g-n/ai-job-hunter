import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AppError, LimitExceededError, NotFoundError } from "@/lib/errors";
import { createManualJob, deleteManualJob } from "@/server/jobs/manual";

const A = "manual-user-a";
const B = "manual-user-b";
const noAi = { record: async () => {}, assertBudget: async () => {} };
const TEXT = "Frontend Engineer at Lisbon Labs. Build React and TypeScript apps. ".repeat(3);

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

const usageCount = async (userId = A) =>
  (await db.usageCounter.findFirst({ where: { userId, action: "JOB_NORMALIZE" } }))?.count ?? 0;

beforeEach(async () => {
  await db.user.create({ data: { id: A, name: "A", email: "a@example.com" } });
  await db.user.create({ data: { id: B, name: "B", email: "b@example.com" } });
});

describe("createManualJob", () => {
  it("normalises pasted text into an owned MANUAL job with an embedding", async () => {
    const job = await createManualJob(
      A,
      false,
      { text: TEXT, url: "https://example.com/j/1" },
      noAi,
    );
    expect(job).toMatchObject({
      source: "MANUAL",
      ownerId: A,
      title: "Frontend Engineer",
      company: "Lisbon Labs",
      url: "https://example.com/j/1",
    });
    expect(job.dedupeHash.endsWith(`:${A}`)).toBe(true);
    expect(job.expiresAt.getTime()).toBeGreaterThan(Date.now() + 364 * 24 * 3600 * 1000);
    const [row] = await db.$queryRaw<
      { ok: boolean }[]
    >`SELECT ("embedding" IS NOT NULL) AS ok FROM "Job" WHERE "id" = ${job.id}`;
    expect(row.ok).toBe(true);
    expect(await usageCount()).toBe(1);
  });

  it("rejects text under 50 chars with INVALID_INPUT and consumes nothing", async () => {
    const err = await createManualJob(A, false, { text: "too short" }, noAi).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("INVALID_INPUT");
    expect(await usageCount()).toBe(0);
  });

  it("rejects a non-http url with INVALID_INPUT and consumes nothing", async () => {
    const err = await createManualJob(
      A,
      false,
      { text: TEXT, url: "javascript:alert(1)" },
      noAi,
    ).catch((e) => e);
    expect((err as AppError).code).toBe("INVALID_INPUT");
    expect(await usageCount()).toBe(0);
  });

  it("refunds usage when the AI fails", async () => {
    await expect(
      createManualJob(A, false, { text: TEXT }, { ...noAi, model: failingModel() }),
    ).rejects.toMatchObject({ code: "AI_FAILED" });
    expect(await usageCount()).toBe(0);
    expect(await db.job.count()).toBe(0);
  });

  it("returns the existing job when the same user pastes the same posting twice", async () => {
    const first = await createManualJob(A, false, { text: TEXT }, noAi);
    const second = await createManualJob(A, false, { text: TEXT }, noAi);
    expect(second.id).toBe(first.id);
    expect(await db.job.count()).toBe(1);
  });

  it("gives each user their own copy of the same posting", async () => {
    const a = await createManualJob(A, false, { text: TEXT }, noAi);
    const b = await createManualJob(B, false, { text: TEXT }, noAi);
    expect(a.id).not.toBe(b.id);
  });

  it("stops at the daily limit", async () => {
    await createManualJob(A, true, { text: TEXT }, noAi);
    await createManualJob(A, true, { text: TEXT }, noAi);
    await expect(createManualJob(A, true, { text: TEXT }, noAi)).rejects.toBeInstanceOf(
      LimitExceededError,
    );
  });
});

describe("deleteManualJob", () => {
  it("deletes the owner job", async () => {
    const job = await createManualJob(A, false, { text: TEXT }, noAi);
    await deleteManualJob(A, job.id);
    expect(await db.job.count()).toBe(0);
  });

  it("gives another user a NotFoundError and keeps the job", async () => {
    const job = await createManualJob(A, false, { text: TEXT }, noAi);
    await expect(deleteManualJob(B, job.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.job.count()).toBe(1);
  });
});
