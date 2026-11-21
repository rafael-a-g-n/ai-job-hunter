import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { PDF_MIME } from "@/server/cv/parse";
import { profileToText } from "@/server/cv/schemas";
import { getEmbedder } from "@/server/embeddings/embedder";
import { toPgVector } from "@/server/embeddings/vector";
import { getBlobStore } from "@/server/storage/blob-store";
import { loadDemoTemplate } from "./template";

export const DEMO_IP_DAILY_LIMIT = 3;
export const DEMO_TTL_MS = 24 * 3600 * 1000;

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${ip}${env.BETTER_AUTH_SECRET}`).digest("hex");
}

/** The client IP from proxy headers (first x-forwarded-for entry, then x-real-ip), else "unknown". */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Counts one signup for this IP today in a single statement; throws DEMO_LIMIT past the limit. */
async function claimSignup(ipHash: string, now: Date): Promise<string> {
  const day = now.toISOString().slice(0, 10);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "DemoSignup" ("ipHash", "day", "count") VALUES (${ipHash}, ${day}::date, 1)
    ON CONFLICT ("ipHash", "day")
    DO UPDATE SET "count" = "DemoSignup"."count" + 1
    WHERE "DemoSignup"."count" < ${DEMO_IP_DAILY_LIMIT}::int
    RETURNING "count"`;
  if (rows.length === 0) {
    throw new AppError(
      "DEMO_LIMIT",
      "Demo limit reached for today. Create a free account instead.",
    );
  }
  return day;
}

async function releaseSignup(ipHash: string, day: string): Promise<void> {
  await db.$executeRaw`UPDATE "DemoSignup" SET "count" = GREATEST("count" - 1, 0)
    WHERE "ipHash" = ${ipHash} AND "day" = ${day}::date`;
}

/** Copies the template CV, saved jobs, matches and letter into the new user's own rows. */
async function cloneTemplate(userId: string, now: Date, blobKeys: string[]): Promise<void> {
  const t = loadDemoTemplate();
  const data = Buffer.from(t.cv.blob, "base64");
  const blobKey = `cv/${userId}/${randomUUID()}`;
  await getBlobStore().put(blobKey, data, PDF_MIME);
  blobKeys.push(blobKey);

  const [vector] = await getEmbedder().embed([profileToText(t.cv.profile)], "document");
  const embedding = toPgVector(vector);

  const cv = await db.cv.create({
    data: {
      userId,
      fileName: t.cv.fileName,
      blobKey,
      mimeType: PDF_MIME,
      sizeBytes: data.length,
      rawText: t.cv.rawText,
      status: "ANALYZED",
      isActive: true,
      profile: t.cv.profile as Prisma.InputJsonValue,
      analysis: t.cv.analysis as Prisma.InputJsonValue,
    },
  });
  await db.$executeRaw`UPDATE "Cv" SET "embedding" = ${embedding}::vector WHERE "id" = ${cv.id}`;

  const jobs = await db.job.findMany({
    where: { dedupeHash: { in: t.savedJobDedupeHashes }, expiresAt: { gt: now } },
    select: { id: true, dedupeHash: true },
  });
  if (jobs.length === 0) return;
  await db.savedJob.createMany({ data: jobs.map((j) => ({ userId, jobId: j.id })) });

  const sims = await db.$queryRaw<{ id: string; sim: number }[]>`
    SELECT j."id", (1 - (j."embedding" <=> c."embedding"))::float8 AS "sim"
    FROM "Job" j, "Cv" c
    WHERE c."id" = ${cv.id} AND j."id" IN (${Prisma.join(jobs.map((j) => j.id))})
      AND j."embedding" IS NOT NULL AND c."embedding" IS NOT NULL`;
  if (sims.length > 0) {
    // The template carries no AI scores, so `score` stays null and the first re-rank fills it in.
    await db.matchResult.createMany({
      data: sims.map((s) => ({ cvId: cv.id, jobId: s.id, vectorScore: s.sim })),
    });
  }

  const letterJob = jobs.find((j) => j.dedupeHash === t.letter.jobDedupeHash);
  if (letterJob) {
    await db.coverLetter.create({
      data: {
        userId,
        cvId: cv.id,
        jobId: letterJob.id,
        tone: t.letter.tone,
        language: t.letter.language,
        length: t.letter.length,
        content: t.letter.content,
      },
    });
  }
}

/**
 * Creates an isolated demo user (24 h, no password) pre-filled from the template. At most 3 per IP
 * hash per UTC day. A failed clone removes the half-built user and gives the signup back.
 */
export async function createDemoUser(
  ip: string,
  now: Date = new Date(),
): Promise<{ userId: string }> {
  const ipHash = hashIp(ip);
  const day = await claimSignup(ipHash, now);
  const userId = randomUUID();
  const blobKeys: string[] = [];
  try {
    await db.user.create({
      data: {
        id: userId,
        name: "Demo User",
        email: `demo-${userId}@demo.local`,
        emailVerified: true,
        isDemo: true,
        demoExpiresAt: new Date(now.getTime() + DEMO_TTL_MS),
      },
    });
    await cloneTemplate(userId, now, blobKeys);
    return { userId };
  } catch (e) {
    await Promise.allSettled([
      ...blobKeys.map((k) => getBlobStore().delete(k)),
      db.user.deleteMany({ where: { id: userId } }),
      releaseSignup(ipHash, day),
    ]);
    throw e;
  }
}
