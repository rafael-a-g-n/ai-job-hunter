import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createDemoUser } from "@/server/demo/create-demo";
import { seedJobs } from "@/server/demo/seed-jobs";
import { getDashboard } from "@/server/dashboard";

beforeEach(async () => {
  await seedJobs(db);
});

describe("getDashboard", () => {
  it("returns nulls and empties for a new user", async () => {
    await db.user.create({ data: { id: "new", name: "New", email: "new@example.com" } });
    const d = await getDashboard("new", false);
    expect(d.activeCv).toBeNull();
    expect(d.topMatches).toEqual([]);
    expect(d.recentLetters).toEqual([]);
    expect(d.savedJobsCount).toBe(0);
    expect(d.usage.CV_ANALYSIS).toEqual({ used: 0, limit: 3 });
  });

  it("shows the CV score, cached matches and a letter for the demo user", async () => {
    const { userId } = await createDemoUser("1.1.1.1");
    const d = await getDashboard(userId, true);
    expect(d.activeCv?.status).toBe("ANALYZED");
    expect(d.activeCv?.overallScore).toBe(78);
    expect(d.topMatches.length).toBeGreaterThanOrEqual(1);
    expect(d.topMatches.length).toBeLessThanOrEqual(5);
    const scores = d.topMatches.map((m) => m.score ?? -1);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores.every((s) => s >= 0)).toBe(true);
    expect(d.recentLetters).toHaveLength(1);
    expect(d.recentLetters[0].jobTitle).toBeTruthy();
    expect(d.savedJobsCount).toBeGreaterThanOrEqual(1);
    expect(d.usage.CV_ANALYSIS.limit).toBe(1);
  });

  it("makes no AI call and consumes no usage", async () => {
    const { userId } = await createDemoUser("1.1.1.1");
    await getDashboard(userId, true);
    expect(await db.aiCall.count()).toBe(0);
    expect(await db.usageCounter.count({ where: { userId } })).toBe(0);
  });

  it("does not show another user's data", async () => {
    await createDemoUser("1.1.1.1");
    await db.user.create({ data: { id: "other", name: "O", email: "o@example.com" } });
    const d = await getDashboard("other", false);
    expect(d.activeCv).toBeNull();
    expect(d.topMatches).toEqual([]);
    expect(d.recentLetters).toEqual([]);
    expect(d.savedJobsCount).toBe(0);
  });
});
