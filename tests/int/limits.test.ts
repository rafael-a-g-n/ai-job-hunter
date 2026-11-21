import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { LimitExceededError } from "@/lib/errors";
import {
  assertGlobalBudget,
  consumeUsage,
  getUsageSummary,
  refundUsage,
} from "@/server/limits/usage";

const UID = "limits-user";

beforeEach(async () => {
  await db.user.create({ data: { id: UID, name: "Lim", email: "lim@example.com" } });
});

describe("consumeUsage", () => {
  it("allows 3 CV analyses for a regular user and rejects the 4th", async () => {
    expect(await consumeUsage(UID, "CV_ANALYSIS", false)).toEqual({ remaining: 2 });
    expect(await consumeUsage(UID, "CV_ANALYSIS", false)).toEqual({ remaining: 1 });
    expect(await consumeUsage(UID, "CV_ANALYSIS", false)).toEqual({ remaining: 0 });
    await expect(consumeUsage(UID, "CV_ANALYSIS", false)).rejects.toBeInstanceOf(
      LimitExceededError,
    );
  });

  it("rejects a demo user's 2nd CV analysis", async () => {
    await consumeUsage(UID, "CV_ANALYSIS", true);
    await expect(consumeUsage(UID, "CV_ANALYSIS", true)).rejects.toBeInstanceOf(LimitExceededError);
  });

  it("gives exactly 3 successes out of 20 parallel calls", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => consumeUsage(UID, "CV_ANALYSIS", false)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(17);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(LimitExceededError);
    const row = await db.usageCounter.findFirstOrThrow({ where: { userId: UID } });
    expect(row.count).toBe(3);
  });

  it("lets one more through after a refund", async () => {
    for (let i = 0; i < 3; i++) await consumeUsage(UID, "CV_ANALYSIS", false);
    await refundUsage(UID, "CV_ANALYSIS");
    await expect(consumeUsage(UID, "CV_ANALYSIS", false)).resolves.toEqual({ remaining: 0 });
    await expect(consumeUsage(UID, "CV_ANALYSIS", false)).rejects.toBeInstanceOf(
      LimitExceededError,
    );
  });

  it("never refunds below zero", async () => {
    await refundUsage(UID, "COVER_LETTER");
    expect(await getUsageSummary(UID, false)).toMatchObject({
      COVER_LETTER: { used: 0, limit: 10 },
    });
    await consumeUsage(UID, "COVER_LETTER", false);
    await refundUsage(UID, "COVER_LETTER");
    await refundUsage(UID, "COVER_LETTER");
    const row = await db.usageCounter.findFirstOrThrow({ where: { userId: UID } });
    expect(row.count).toBe(0);
  });

  it("resets on a new UTC day", async () => {
    const now = new Date();
    const yesterday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    await db.usageCounter.create({
      data: { userId: UID, action: "CV_ANALYSIS", day: yesterday, count: 3 },
    });
    await expect(consumeUsage(UID, "CV_ANALYSIS", false)).resolves.toEqual({ remaining: 2 });
  });
});

describe("getUsageSummary", () => {
  it("reports used and limit per action for today", async () => {
    await consumeUsage(UID, "CV_ANALYSIS", true);
    expect(await getUsageSummary(UID, true)).toEqual({
      CV_ANALYSIS: { used: 1, limit: 1 },
      COVER_LETTER: { used: 0, limit: 2 },
      MATCH_RERANK: { used: 0, limit: 3 },
      JOB_NORMALIZE: { used: 0, limit: 2 },
    });
  });
});

describe("assertGlobalBudget", () => {
  const call = (costUsd: string, createdAt?: Date) =>
    db.aiCall.create({
      data: {
        userId: UID,
        purpose: "t",
        model: "m",
        inputTokens: 1,
        outputTokens: 1,
        costUsd,
        durationMs: 1,
        ok: true,
        ...(createdAt ? { createdAt } : {}),
      },
    });

  it("passes under budget and throws once today's costs reach 5", async () => {
    await call("2.5");
    await expect(assertGlobalBudget()).resolves.toBeUndefined();
    await call("2.5");
    await expect(assertGlobalBudget()).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
  });

  it("ignores costs from earlier days", async () => {
    await call("9", new Date(Date.now() - 2 * 86_400_000));
    await expect(assertGlobalBudget()).resolves.toBeUndefined();
  });
});
