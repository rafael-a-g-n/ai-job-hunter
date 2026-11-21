import { Prisma, type JobSource } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError, LimitExceededError } from "@/lib/errors";
import { describeError } from "@/server/ai/deps";
import { generateStructured, type AiDeps } from "@/server/ai/structured";
import { getActiveCv, getCv } from "@/server/cv/queries";
import { CvProfile, profileToText } from "@/server/cv/schemas";
import { jobListSelect, visibleJobWhere, type JobListItem } from "@/server/jobs/search";
import { consumeUsage, refundUsage } from "@/server/limits/usage";
import { DESCRIPTION_CHARS, rerankPrompt, rerankSystem } from "./prompts";
import { RerankResult } from "./schemas";

export type MatchView = {
  job: JobListItem;
  vectorScore: number;
  score: number | null;
  matchedSkills: string[];
  gaps: string[];
  explanation: string | null;
};

export type MatchFilters = { remote?: boolean; location?: string };

const RECALL_LIMIT = 50;
const RERANK_BATCH = 10;

type RecallRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  source: JobSource;
  postedAt: Date | null;
  url: string | null;
  snippet: string;
  sim: number;
};

type Cached = {
  score: number | null;
  matchedSkills: string[];
  gaps: string[];
  explanation: string | null;
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function loadCv(userId: string, cvId?: string) {
  const cv = cvId ? await getCv(userId, cvId) : await getActiveCv(userId);
  if (!cv || cv.status !== "ANALYZED" || !cv.profile) {
    throw new AppError("CV_NOT_READY", "Analyze your CV first.");
  }
  return { cv, profile: CvProfile.parse(cv.profile) };
}

/** Nearest visible jobs to the CV embedding. The CV row is user-scoped; a missing embedding gives none. */
async function recall(
  userId: string,
  cvId: string,
  filters: MatchFilters | undefined,
): Promise<RecallRow[]> {
  const extra: Prisma.Sql[] = [];
  if (filters?.remote) extra.push(Prisma.sql`AND j."remote" = true`);
  const location = filters?.location?.trim();
  if (location) {
    extra.push(Prisma.sql`AND j."location" ILIKE ${`%${escapeLike(location)}%`}`);
  }
  return db.$queryRaw<RecallRow[]>`
    SELECT j."id", j."title", j."company", j."location", j."remote", j."source"::text AS "source",
           j."postedAt", j."url", left(j."description", ${DESCRIPTION_CHARS}::int) AS "snippet",
           (1 - (j."embedding" <=> c."embedding"))::float8 AS "sim"
    FROM "Job" j, (SELECT "embedding" FROM "Cv" WHERE "id" = ${cvId} AND "userId" = ${userId}) c
    WHERE j."embedding" IS NOT NULL AND c."embedding" IS NOT NULL
      AND j."expiresAt" > now() AND (j."ownerId" IS NULL OR j."ownerId" = ${userId})
      ${extra.length > 0 ? Prisma.join(extra, " ") : Prisma.empty}
    ORDER BY j."embedding" <=> c."embedding"
    LIMIT ${RECALL_LIMIT}`;
}

function toView(row: RecallRow, cached: Cached | undefined): MatchView {
  return {
    job: {
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location,
      remote: row.remote,
      source: row.source,
      postedAt: row.postedAt,
      url: row.url,
    },
    vectorScore: row.sim,
    score: cached?.score ?? null,
    matchedSkills: cached?.matchedSkills ?? [],
    gaps: cached?.gaps ?? [],
    explanation: cached?.explanation ?? null,
  };
}

/**
 * Semantic matches for a CV: pgvector recall of 50 jobs, then one AI re-rank of the top 10 that
 * have no cached score (cached in MatchResult). If the re-rank cannot run (AI failure or the daily
 * limit), the usage unit is refunded and vector-only results are returned.
 */
export async function findMatches(
  userId: string,
  isDemo: boolean,
  opts: { cvId?: string; filters?: MatchFilters } = {},
  deps: AiDeps = {},
): Promise<MatchView[]> {
  const { cv, profile } = await loadCv(userId, opts.cvId);
  const rows = await recall(userId, cv.id, opts.filters);
  if (rows.length === 0) return [];

  const cachedRows = await db.matchResult.findMany({
    where: { cvId: cv.id, jobId: { in: rows.map((r) => r.id) } },
  });
  const cached = new Map<string, Cached>(cachedRows.map((m) => [m.jobId, m]));

  const batch = rows.slice(0, RERANK_BATCH).filter((r) => cached.get(r.id)?.score == null);
  if (batch.length > 0) {
    let consumed = false;
    try {
      await consumeUsage(userId, "MATCH_RERANK", isDemo);
      consumed = true;
      const result = await generateStructured(
        {
          purpose: "matching.rerank",
          userId,
          model: "fast",
          schema: RerankResult,
          system: rerankSystem(),
          prompt: rerankPrompt(
            profileToText(profile),
            batch.map((r) => ({
              id: r.id,
              title: r.title,
              company: r.company,
              description: r.snippet,
            })),
          ),
          mockKey: "matching.rerank",
        },
        deps,
      );
      const sent = new Map(batch.map((r) => [r.id, r]));
      const fresh = result.results.filter((r) => sent.has(r.jobId));
      await db.$transaction(
        fresh.map((r) => {
          const data = {
            vectorScore: sent.get(r.jobId)!.sim,
            score: r.score,
            matchedSkills: r.matchedSkills,
            gaps: r.gaps,
            explanation: r.explanation,
          };
          return db.matchResult.upsert({
            where: { cvId_jobId: { cvId: cv.id, jobId: r.jobId } },
            create: { cvId: cv.id, jobId: r.jobId, ...data },
            update: data,
          });
        }),
      );
      for (const r of fresh) cached.set(r.jobId, r);
    } catch (e) {
      if (consumed) {
        try {
          await refundUsage(userId, "MATCH_RERANK");
        } catch (refundError) {
          console.error("[matching] failed to refund usage", describeError(refundError));
        }
      }
      // LimitExceededError, AI_FAILED, BUDGET_EXHAUSTED: fall back to vector-only results.
      if (!(e instanceof AppError)) throw e;
      if (!(e instanceof LimitExceededError)) {
        console.error("[matching] re-rank failed", describeError(e));
      }
    }
  }

  const views = rows.map((r) => toView(r, cached.get(r.id)));
  const ranked = views
    .filter((v) => v.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.vectorScore - a.vectorScore);
  const rest = views.filter((v) => v.score === null);
  return [...ranked, ...rest];
}

/** The cached match of the user's active CV for one job. Makes no AI call and uses no usage. */
export async function getMatchForJob(userId: string, jobId: string): Promise<MatchView | null> {
  const cv = await getActiveCv(userId);
  if (!cv) return null;
  const match = await db.matchResult.findFirst({
    where: { cvId: cv.id, jobId, score: { not: null }, job: visibleJobWhere(userId) },
    include: { job: { select: jobListSelect } },
  });
  if (!match) return null;
  return {
    job: match.job,
    vectorScore: match.vectorScore,
    score: match.score,
    matchedSkills: match.matchedSkills,
    gaps: match.gaps,
    explanation: match.explanation,
  };
}

/** Scored matches already cached for a CV, best first. Makes no AI call and uses no usage. */
export async function listCachedMatches(
  userId: string,
  cvId: string,
  limit: number,
): Promise<MatchView[]> {
  const rows = await db.matchResult.findMany({
    where: { cvId, cv: { userId }, score: { not: null }, job: visibleJobWhere(userId) },
    include: { job: { select: jobListSelect } },
    orderBy: [{ score: "desc" }, { vectorScore: "desc" }],
    take: limit,
  });
  return rows.map((m) => ({
    job: m.job,
    vectorScore: m.vectorScore,
    score: m.score,
    matchedSkills: m.matchedSkills,
    gaps: m.gaps,
    explanation: m.explanation,
  }));
}
