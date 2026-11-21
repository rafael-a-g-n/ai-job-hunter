import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getBlobStore } from "@/server/storage/blob-store";

/**
 * Deletes all of the user's CV files, then the user (rows cascade). A missing blob is fine; any
 * other blob error aborts before the user is touched, so the deletion can be retried.
 * AiCall rows survive (userId set to null): the global daily budget sums them.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const cvs = await db.cv.findMany({ where: { userId }, select: { blobKey: true } });
  const store = getBlobStore();
  for (const cv of cvs) {
    await store.delete(cv.blobKey).catch((e: unknown) => {
      if (!(e instanceof NotFoundError)) throw e;
    });
  }
  await db.user.deleteMany({ where: { id: userId } });
}
