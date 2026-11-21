import type { Cv } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

// The embedding column is `Unsupported`, so Prisma never selects it; every query is user-scoped.

export async function getCv(userId: string, cvId: string): Promise<Cv> {
  const cv = await db.cv.findFirst({ where: { id: cvId, userId } });
  if (!cv) throw new NotFoundError("CV");
  return cv;
}

export async function getActiveCv(userId: string): Promise<Cv | null> {
  return db.cv.findFirst({ where: { userId, isActive: true }, orderBy: { createdAt: "desc" } });
}

export async function listCvs(userId: string): Promise<Cv[]> {
  return db.cv.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}
