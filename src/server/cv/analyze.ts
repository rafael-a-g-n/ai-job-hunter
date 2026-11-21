import type { Cv, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { generateStructured, type AiDeps } from "@/server/ai/structured";
import { getEmbedder } from "@/server/embeddings/embedder";
import { toPgVector } from "@/server/embeddings/vector";
import { consumeUsage, refundUsage } from "@/server/limits/usage";
import { cvAnalysisPrompt, cvAnalysisSystem, type AnalysisLanguage } from "./prompts";
import { getCv } from "./queries";
import { CvAnalysisResult, CvProfile, profileToText } from "./schemas";

const GENERIC_FAILURE = "The analysis failed. Please try again.";
const NOT_READY = "This CV can't be analysed. Upload it again.";

async function embedProfile(profile: CvProfile): Promise<string> {
  const [vector] = await getEmbedder().embed([profileToText(profile)], "document");
  return toPgVector(vector);
}

/**
 * Analyses a CV: one AI call (usage consumed first, refunded on failure), then embeds the profile.
 * Throws NotFoundError for another user's CV and AppError('CV_NOT_READY') for FAILED/ANALYZING.
 */
export async function analyzeCv(
  userId: string,
  cvId: string,
  language: AnalysisLanguage,
  deps: AiDeps = {},
): Promise<Cv> {
  const cv = await getCv(userId, cvId);
  if (cv.status === "FAILED" || cv.status === "ANALYZING") {
    throw new AppError("CV_NOT_READY", NOT_READY);
  }
  const user = await db.user.findUnique({ where: { id: userId }, select: { isDemo: true } });
  if (!user) throw new NotFoundError("User");

  await consumeUsage(userId, "CV_ANALYSIS", user.isDemo);

  // Atomic claim, so two parallel requests cannot both run the analysis.
  const claimed = await db.cv.updateMany({
    where: { id: cvId, userId, status: { in: ["UPLOADED", "ANALYZED"] } },
    data: { status: "ANALYZING", failureReason: null },
  });
  if (claimed.count === 0) {
    await refundUsage(userId, "CV_ANALYSIS");
    throw new AppError("CV_NOT_READY", NOT_READY);
  }

  try {
    const result = await generateStructured(
      {
        purpose: "cv.analysis",
        userId,
        model: "fast",
        schema: CvAnalysisResult,
        system: cvAnalysisSystem(language),
        prompt: cvAnalysisPrompt(cv.rawText ?? ""),
        mockKey: "cv.analysis",
      },
      deps,
    );
    const embedding = await embedProfile(result.profile);
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE "Cv" SET "embedding" = ${embedding}::vector WHERE "id" = ${cvId} AND "userId" = ${userId}`;
      return tx.cv.update({
        where: { id: cvId },
        data: {
          profile: result.profile as Prisma.InputJsonValue,
          analysis: result.analysis as Prisma.InputJsonValue,
          status: "ANALYZED",
          failureReason: null,
        },
      });
    });
  } catch (e) {
    await db.cv.update({
      where: { id: cvId },
      data: {
        status: "FAILED",
        failureReason: e instanceof AppError ? e.userMessage : GENERIC_FAILURE,
      },
    });
    await refundUsage(userId, "CV_ANALYSIS");
    throw e;
  }
}

/** Saves an edited profile and re-embeds it. No AI call and no usage. */
export async function updateCvProfile(
  userId: string,
  cvId: string,
  profile: CvProfile,
): Promise<Cv> {
  const parsed = CvProfile.parse(profile);
  const cv = await getCv(userId, cvId);
  if (cv.status !== "ANALYZED") {
    throw new AppError("CV_NOT_READY", "Analyse this CV before editing its profile.");
  }
  const embedding = await embedProfile(parsed);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "Cv" SET "embedding" = ${embedding}::vector WHERE "id" = ${cvId} AND "userId" = ${userId}`;
    return tx.cv.update({
      where: { id: cvId },
      data: { profile: parsed as Prisma.InputJsonValue },
    });
  });
}
