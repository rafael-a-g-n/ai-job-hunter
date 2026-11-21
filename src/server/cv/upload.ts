import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { CV_TOO_LARGE_MESSAGE, MAX_CV_BYTES } from "@/lib/cv-limits";
import { AppError } from "@/lib/errors";
import type { Cv } from "@/generated/prisma/client";
import { getBlobStore } from "@/server/storage/blob-store";
import { DOCX_MIME, extractText, PDF_MIME } from "./parse";

export const MIN_CV_TEXT_CHARS = 200;
export const UNREADABLE_CV_MESSAGE =
  "We couldn't read text from this file. Try a text-based PDF or DOCX.";

const ALLOWED_TYPES = new Set([PDF_MIME, DOCX_MIME]);

export interface CvFile {
  name: string;
  type: string;
  size: number;
  data: Buffer;
}

export async function uploadCv(userId: string, file: CvFile): Promise<Cv> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new AppError("INVALID_FILE", "Upload a PDF or DOCX file.");
  }
  // Trust the real byte length, not the client-declared size.
  if (file.data.length > MAX_CV_BYTES || file.size > MAX_CV_BYTES) {
    throw new AppError("INVALID_FILE", CV_TOO_LARGE_MESSAGE);
  }
  if (file.data.length === 0) {
    throw new AppError("INVALID_FILE", "The file is empty.");
  }

  // Random, unguessable key; files are only ever served through our server.
  const blobKey = `cv/${userId}/${randomUUID()}`;
  const store = getBlobStore();
  await store.put(blobKey, file.data, file.type);

  try {
    let text = "";
    try {
      text = await extractText(file.data, file.type);
    } catch {
      // Corrupt or unparsable file: handled like an unreadable one.
    }
    const readable = text.length >= MIN_CV_TEXT_CHARS;

    return await db.$transaction(async (tx) => {
      // Activation follows analysis success: a new CV is active only when the user has no
      // ANALYZED CV (analyzeCv activates it later). A failed upload never steals active status;
      // it is active only as the user's very first CV.
      const total = await tx.cv.count({ where: { userId } });
      const analyzed = await tx.cv.count({ where: { userId, status: "ANALYZED" } });
      const isActive = readable ? analyzed === 0 : total === 0;
      if (isActive) {
        await tx.cv.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
      }
      return tx.cv.create({
        data: {
          userId,
          fileName: file.name,
          blobKey,
          mimeType: file.type,
          sizeBytes: file.data.length,
          rawText: text,
          status: readable ? "UPLOADED" : "FAILED",
          failureReason: readable ? null : UNREADABLE_CV_MESSAGE,
          isActive,
        },
      });
    });
  } catch (e) {
    await store.delete(blobKey).catch(() => undefined);
    throw e;
  }
}
