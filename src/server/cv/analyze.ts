import type { Cv, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { describeError } from "@/server/ai/deps";
import { generateStructured, type AiDeps } from "@/server/ai/structured";
import { getEmbedder } from "@/server/embeddings/embedder";
import { toPgVector } from "@/server/embeddings/vector";
import { consumeUsage, refundUsage } from "@/server/limits/usage";
import { cvAnalysisPrompt, cvAnalysisSystem, type AnalysisLanguage } from "./prompts";
import { getCv } from "./queries";
import { CvAnalysisResult, CvProfile, profileToText } from "./schemas";
import { MAX_OUTPUT_TOKENS } from "@/server/ai/models";

const GENERIC_FAILURE = "The analysis failed. Please try again.";
const STALE_CLAIM_MS = 5 * 60 * 1000;
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
  const staleBefore = () => new Date(Date.now() - STALE_CLAIM_MS);
  const stale = cv.status === "ANALYZING" && cv.updatedAt < staleBefore();
  if (cv.status === "FAILED" || (cv.status === "ANALYZING" && !stale)) {
    throw new AppError("CV_NOT_READY", NOT_READY);
  }
  const user = await db.user.findUnique({ where: { id: userId }, select: { isDemo: true } });
  if (!user) throw new NotFoundError("User");
  // A CV that already holds an analysis keeps it when a re-analysis fails.
  const hadAnalysis = cv.profile !== null && cv.analysis !== null;

  await consumeUsage(userId, "CV_ANALYSIS", user.isDemo);

  // Atomic claim, so two parallel requests cannot both run the analysis. A claim older than
  // STALE_CLAIM_MS (a crashed run) can be reclaimed.
  const claimed = await db.cv.updateMany({
    where: {
      id: cvId,
      userId,
      OR: [
        { status: { in: ["UPLOADED", "ANALYZED"] } },
        { status: "ANALYZING", updatedAt: { lt: staleBefore() } },
      ],
    },
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
        maxOutputTokens: MAX_OUTPUT_TOKENS.cvAnalysis,
      },
      deps,
    );
    const embedding = await embedProfile(result.profile);
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE "Cv" SET "embedding" = ${embedding}::vector WHERE "id" = ${cvId} AND "userId" = ${userId}`;
      // Scores were computed against the old profile.
      await tx.matchResult.deleteMany({ where: { cvId, cv: { userId } } });
      // Activation follows analysis success.
      await tx.cv.updateMany({
        where: { userId, isActive: true, NOT: { id: cvId } },
        data: { isActive: false },
      });
      return tx.cv.update({
        where: { id: cvId },
        data: {
          profile: result.profile as Prisma.InputJsonValue,
          analysis: result.analysis as Prisma.InputJsonValue,
          status: "ANALYZED",
          failureReason: null,
          isActive: true,
        },
      });
    });
  } catch (e) {
    // Neither step may mask the original error or skip the other.
    try {
      await db.cv.update({
        where: { id: cvId },
        data: hadAnalysis
          ? { status: "ANALYZED", failureReason: null }
          : {
              status: "FAILED",
              failureReason: e instanceof AppError ? e.userMessage : GENERIC_FAILURE,
            },
      });
    } catch (statusError) {
      console.error("[cv] failed to restore CV status", describeError(statusError));
    }
    try {
      await refundUsage(userId, "CV_ANALYSIS");
    } catch (refundError) {
      console.error("[cv] failed to refund usage", describeError(refundError));
    }
    throw e;
  }
}

/** Saves an edited profile, re-embeds it and drops its cached match scores. No AI call and no usage. */
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
    await tx.matchResult.deleteMany({ where: { cvId, cv: { userId } } });
    return tx.cv.update({
      where: { id: cvId },
      data: { profile: parsed as Prisma.InputJsonValue },
    });
  });
}
