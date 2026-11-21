import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getBlobStore } from "@/server/storage/blob-store";

/**
 * Deletes demo users whose 24 h are up. Blobs go first (the cascade only removes rows); a missing
 * blob is fine, but any other blob error keeps that user for the next run. Returns users deleted.
 */
export async function cleanupExpiredDemoUsers(now: Date): Promise<number> {
  const expired = await db.user.findMany({
    where: { isDemo: true, demoExpiresAt: { lt: now } },
    select: { id: true, cvs: { select: { blobKey: true } } },
  });
  const store = getBlobStore();
  let deleted = 0;
  for (const user of expired) {
    try {
      for (const cv of user.cvs) {
        await store.delete(cv.blobKey).catch((e: unknown) => {
          if (!(e instanceof NotFoundError)) throw e;
        });
      }
      await db.user.delete({ where: { id: user.id } });
      deleted++;
    } catch (e) {
      console.error("[demo] cleanup failed for a demo user", e instanceof Error ? e.name : "error");
    }
  }
  return deleted;
}
