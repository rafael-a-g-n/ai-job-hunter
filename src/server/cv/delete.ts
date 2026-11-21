import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { describeError } from "@/server/ai/deps";
import { getBlobStore } from "@/server/storage/blob-store";

/**
 * Deletes one of the user's CVs (its matches and cover letters go with it) and its file. If it
 * was the active CV, the most recent other ANALYZED CV becomes active. Another user's CV is a
 * NotFoundError.
 */
export async function deleteCv(userId: string, cvId: string): Promise<void> {
  const blobKey = await db.$transaction(async (tx) => {
    const cv = await tx.cv.findFirst({
      where: { id: cvId, userId },
      select: { blobKey: true, isActive: true },
    });
    if (!cv) throw new NotFoundError("CV");
    await tx.cv.delete({ where: { id: cvId } });
    if (cv.isActive) {
      const next = await tx.cv.findFirst({
        where: { userId, status: "ANALYZED" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (next) await tx.cv.update({ where: { id: next.id }, data: { isActive: true } });
    }
    return cv.blobKey;
  });
  // Best effort: the row is gone either way, and an orphaned file is never served.
  await getBlobStore()
    .delete(blobKey)
    .catch((e: unknown) => console.error("[cv] failed to delete blob", describeError(e)));
}
