import type { CoverLetter } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";

export const MAX_LETTER_CHARS = 10_000;

const jobSelect = { select: { id: true, title: true, company: true } } as const;

export type LetterWithJob = CoverLetter & { job: { id: string; title: string; company: string } };

export async function listLetters(userId: string): Promise<LetterWithJob[]> {
  return db.coverLetter.findMany({
    where: { userId },
    include: { job: jobSelect },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLetter(userId: string, id: string): Promise<LetterWithJob> {
  const letter = await db.coverLetter.findFirst({
    where: { id, userId },
    include: { job: jobSelect },
  });
  if (!letter) throw new NotFoundError("Letter");
  return letter;
}

export async function updateLetter(userId: string, id: string, content: string): Promise<void> {
  if (content.length > MAX_LETTER_CHARS) {
    throw new AppError(
      "INVALID_INPUT",
      `A letter can have at most ${MAX_LETTER_CHARS} characters.`,
    );
  }
  const { count } = await db.coverLetter.updateMany({ where: { id, userId }, data: { content } });
  if (count === 0) throw new NotFoundError("Letter");
}

export async function deleteLetter(userId: string, id: string): Promise<void> {
  const { count } = await db.coverLetter.deleteMany({ where: { id, userId } });
  if (count === 0) throw new NotFoundError("Letter");
}
