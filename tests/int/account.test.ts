import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { deleteAccount } from "@/server/account/delete-account";
import { createDemoUser } from "@/server/demo/create-demo";
import { seedJobs } from "@/server/demo/seed-jobs";
import { getBlobStore } from "@/server/storage/blob-store";

beforeEach(async () => {
  await seedJobs(db);
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

describe("deleteAccount", () => {
  it("removes the user's rows and blobs and leaves another user untouched", async () => {
    const a = await createDemoUser("1.1.1.1");
    const b = await createDemoUser("1.1.1.1");
    const cvA = await db.cv.findFirstOrThrow({ where: { userId: a.userId } });
    const cvB = await db.cv.findFirstOrThrow({ where: { userId: b.userId } });
    await db.usageCounter.create({
      data: { userId: a.userId, action: "CV_ANALYSIS", day: new Date(), count: 1 },
    });
    await db.aiCall.create({
      data: {
        userId: a.userId,
        purpose: "x",
        model: "m",
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0.01,
        durationMs: 1,
        ok: true,
      },
    });

    await deleteAccount(a.userId);

    expect(await db.user.findUnique({ where: { id: a.userId } })).toBeNull();
    expect(await db.cv.count({ where: { userId: a.userId } })).toBe(0);
    expect(await db.matchResult.count({ where: { cvId: cvA.id } })).toBe(0);
    expect(await db.savedJob.count({ where: { userId: a.userId } })).toBe(0);
    expect(await db.coverLetter.count({ where: { userId: a.userId } })).toBe(0);
    expect(await db.usageCounter.count({ where: { userId: a.userId } })).toBe(0);
    expect(await blobExists(cvA.blobKey)).toBe(false);
    // Cost rows survive for the global budget, detached from the user.
    expect(await db.aiCall.count({ where: { userId: null } })).toBe(1);

    expect(await db.user.findUnique({ where: { id: b.userId } })).not.toBeNull();
    expect(await db.cv.count({ where: { userId: b.userId } })).toBe(1);
    expect(await db.matchResult.count({ where: { cvId: cvB.id } })).toBeGreaterThan(0);
    expect(await db.coverLetter.count({ where: { userId: b.userId } })).toBe(1);
    expect(await blobExists(cvB.blobKey)).toBe(true);
  });

  it("deletes a user whose blob is already gone", async () => {
    const a = await createDemoUser("1.1.1.1");
    const cv = await db.cv.findFirstOrThrow({ where: { userId: a.userId } });
    await getBlobStore().delete(cv.blobKey);
    await expect(deleteAccount(a.userId)).resolves.toBeUndefined();
    expect(await db.user.findUnique({ where: { id: a.userId } })).toBeNull();
  });
});
