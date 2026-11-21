import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { LimitExceededError, NotFoundError } from "@/lib/errors";
import { POST } from "@/app/api/demo/route";
import { getUserFromHeaders } from "@/server/auth/session";
import { analyzeCv } from "@/server/cv/analyze";
import { getCv } from "@/server/cv/queries";
import { cleanupExpiredDemoUsers } from "@/server/demo/cleanup";
import { findMatches } from "@/server/matching/match";
import { createDemoUser } from "@/server/demo/create-demo";
import { seedJobs } from "@/server/demo/seed-jobs";
import { verifyTurnstile } from "@/server/demo/turnstile";
import { getBlobStore } from "@/server/storage/blob-store";

vi.mock("@/server/demo/turnstile", () => ({ verifyTurnstile: vi.fn() }));

const HOUR = 3600 * 1000;

beforeEach(async () => {
  await seedJobs(db);
  vi.mocked(verifyTurnstile).mockReset().mockResolvedValue(true);
});

async function blobExists(key: string): Promise<boolean> {
  return getBlobStore()
    .get(key)
    .then(
      () => true,
      (e: unknown) => {
        if (e instanceof NotFoundError) return false;
        throw e;
      },
    );
}

describe("createDemoUser", () => {
  it("creates a demo user with an analysed CV, saved jobs, matches and a letter", async () => {
    const { userId } = await createDemoUser("1.1.1.1");
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.isDemo).toBe(true);
    expect(user.emailVerified).toBe(true);
    expect(user.email).toBe(`demo-${userId}@demo.local`);
    expect(user.demoExpiresAt!.getTime() - Date.now()).toBeGreaterThan(23 * HOUR);
    expect(await db.account.count({ where: { userId } })).toBe(0);

    const cv = await db.cv.findFirstOrThrow({ where: { userId } });
    expect(cv.status).toBe("ANALYZED");
    expect(cv.isActive).toBe(true);
    expect(cv.profile).not.toBeNull();
    expect(cv.analysis).not.toBeNull();
    expect(cv.blobKey.startsWith(`cv/${userId}/`)).toBe(true);
    expect(await blobExists(cv.blobKey)).toBe(true);
    const [{ n }] = await db.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM "Cv" WHERE "id" = ${cv.id} AND "embedding" IS NOT NULL`;
    expect(Number(n)).toBe(1);

    const saved = await db.savedJob.count({ where: { userId } });
    expect(saved).toBeGreaterThanOrEqual(1);
    expect(await db.matchResult.count({ where: { cvId: cv.id } })).toBeGreaterThanOrEqual(saved);
    const letter = await db.coverLetter.findFirstOrThrow({ where: { userId } });
    expect(letter.cvId).toBe(cv.id);
    expect(letter.content.length).toBeGreaterThan(0);
  });

  it("pre-fills matches with AI scores, so findMatches needs no AI call or usage", async () => {
    const { userId } = await createDemoUser("1.1.1.1");
    const cv = await db.cv.findFirstOrThrow({ where: { userId } });
    const stored = await db.matchResult.findMany({ where: { cvId: cv.id } });
    expect(stored.length).toBeGreaterThanOrEqual(1);
    for (const m of stored) {
      expect(m.score).not.toBeNull();
      expect(m.explanation).toBeTruthy();
      expect(m.matchedSkills.length).toBeGreaterThan(0);
    }
    const views = await findMatches(userId, true);
    expect(views.filter((v) => v.score !== null)).toHaveLength(stored.length);
    expect(await db.aiCall.count()).toBe(0);
    expect(await db.usageCounter.count({ where: { userId, action: "MATCH_RERANK" } })).toBe(0);
  });

  it("does not re-rank uncached jobs while the demo user is on the template CV", async () => {
    const { userId } = await createDemoUser("1.1.1.1");
    const cv = await db.cv.findFirstOrThrow({ where: { userId } });
    // Some template matches are gone (e.g. a job was re-scored away): still no AI call.
    const some = await db.matchResult.findMany({ where: { cvId: cv.id }, take: 2 });
    await db.matchResult.deleteMany({ where: { id: { in: some.map((m) => m.id) } } });
    const views = await findMatches(userId, true);
    expect(views.length).toBeGreaterThan(0);
    expect(views.some((v) => v.score === null)).toBe(true);
    expect(await db.aiCall.count()).toBe(0);
    expect(await db.usageCounter.count({ where: { userId, action: "MATCH_RERANK" } })).toBe(0);
  });

  it("re-ranks once the demo user's active CV is their own", async () => {
    const { userId } = await createDemoUser("1.1.1.1");
    const cv = await db.cv.findFirstOrThrow({ where: { userId } });
    await db.cv.update({ where: { id: cv.id }, data: { rawText: "My own CV text" } });
    await db.matchResult.deleteMany({ where: { cvId: cv.id } });
    const views = await findMatches(userId, true);
    expect(views.some((v) => v.score !== null)).toBe(true);
    expect(await db.usageCounter.count({ where: { userId, action: "MATCH_RERANK" } })).toBe(1);
  });

  it("keeps demo users isolated from each other", async () => {
    const a = await createDemoUser("1.1.1.1");
    const b = await createDemoUser("1.1.1.1");
    const cvA = await db.cv.findFirstOrThrow({ where: { userId: a.userId } });
    await expect(getCv(b.userId, cvA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCv(a.userId, cvA.id)).resolves.toMatchObject({ id: cvA.id });
  });

  it("refuses the 4th demo from the same IP on one day, but not another IP or day", async () => {
    const now = new Date("2026-11-21T10:00:00Z");
    for (let i = 0; i < 3; i++) await createDemoUser("2.2.2.2", now);
    await expect(createDemoUser("2.2.2.2", now)).rejects.toMatchObject({
      code: "DEMO_LIMIT",
      userMessage: "Demo limit reached for today. Create a free account instead.",
    });
    expect(await db.user.count({ where: { isDemo: true } })).toBe(3);
    await expect(createDemoUser("3.3.3.3", now)).resolves.toHaveProperty("userId");
    await expect(
      createDemoUser("2.2.2.2", new Date("2026-11-22T10:00:00Z")),
    ).resolves.toHaveProperty("userId");
  });

  it("counts parallel signups atomically", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => createDemoUser("4.4.4.4")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await db.user.count({ where: { isDemo: true } })).toBe(3);
  });

  it("applies the demo usage limits (second CV analysis is refused)", async () => {
    const { userId } = await createDemoUser("1.1.1.1");
    const cv = await db.cv.findFirstOrThrow({ where: { userId } });
    await analyzeCv(userId, cv.id, "en");
    await expect(analyzeCv(userId, cv.id, "en")).rejects.toBeInstanceOf(LimitExceededError);
  });
});

describe("cleanupExpiredDemoUsers", () => {
  it("deletes expired demo users with their rows and blobs, and leaves others alone", async () => {
    const now = new Date();
    const expired = await createDemoUser("1.1.1.1", now);
    const fresh = await createDemoUser("1.1.1.1", new Date(now.getTime() + 20 * HOUR));
    const regular = await db.user.create({
      data: { id: "regular", name: "Reg", email: "reg@example.com", emailVerified: true },
    });
    const expiredCv = await db.cv.findFirstOrThrow({ where: { userId: expired.userId } });
    const freshCv = await db.cv.findFirstOrThrow({ where: { userId: fresh.userId } });

    const deleted = await cleanupExpiredDemoUsers(new Date(now.getTime() + 25 * HOUR));

    expect(deleted).toBe(1);
    expect(await db.user.findUnique({ where: { id: expired.userId } })).toBeNull();
    expect(await db.cv.count({ where: { userId: expired.userId } })).toBe(0);
    expect(await db.savedJob.count({ where: { userId: expired.userId } })).toBe(0);
    expect(await db.coverLetter.count({ where: { userId: expired.userId } })).toBe(0);
    expect(await blobExists(expiredCv.blobKey)).toBe(false);
    expect(await db.user.findUnique({ where: { id: fresh.userId } })).not.toBeNull();
    expect(await blobExists(freshCv.blobKey)).toBe(true);
    expect(await db.user.findUnique({ where: { id: regular.id } })).not.toBeNull();
  });

  it("returns 0 when nothing has expired", async () => {
    await createDemoUser("1.1.1.1");
    expect(await cleanupExpiredDemoUsers(new Date())).toBe(0);
  });
});

describe("POST /api/demo", () => {
  const request = (body: unknown, ip = "9.9.9.9") =>
    new Request("http://localhost:3000/api/demo", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` },
      body: JSON.stringify(body),
    });

  it("answers 403 and creates nothing when Turnstile fails", async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    const res = await POST(request({ turnstileToken: "bad" }));
    expect(res.status).toBe(403);
    expect(await db.user.count()).toBe(0);
    expect(verifyTurnstile).toHaveBeenCalledWith("bad", "9.9.9.9");
  });

  it("creates a demo user and a session cookie that authenticates it", async () => {
    const res = await POST(request({ turnstileToken: "ok" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ redirect: "/dashboard" });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(cookie).toContain("better-auth.session_token=");
    // Checked before the first getSession, which may slide the expiry forward.
    const created = await db.session.findFirstOrThrow({ include: { user: true } });
    expect(created.expiresAt.getTime()).toBe(created.user.demoExpiresAt!.getTime());
    const user = await getUserFromHeaders(new Headers({ cookie }));
    expect(user).toMatchObject({ id: created.userId, isDemo: true });
    expect(user?.email).toMatch(/^demo-.+@demo\.local$/);
  });

  it("stops authenticating the demo user once the account has expired", async () => {
    const res = await POST(request({ turnstileToken: "ok" }));
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const headers = new Headers({ cookie });
    expect(await getUserFromHeaders(headers)).not.toBeNull();
    await db.user.updateMany({ data: { demoExpiresAt: new Date(Date.now() - 1000) } });
    expect(await getUserFromHeaders(headers)).toBeNull();
  });

  it("answers 429 once the IP has used its 3 demos", async () => {
    for (let i = 0; i < 3; i++)
      expect((await POST(request({ turnstileToken: "" }))).status).toBe(200);
    const res = await POST(request({ turnstileToken: "" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("DEMO_LIMIT");
  });

  it("rejects a malformed body", async () => {
    expect((await POST(request("nope"))).status).toBe(400);
  });
});
