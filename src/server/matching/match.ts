import { Prisma, type JobSource } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError, LimitExceededError } from "@/lib/errors";
import { describeError } from "@/server/ai/deps";
import { generateStructured, type AiDeps } from "@/server/ai/structured";
import { ensureCvEmbedding } from "@/server/cv/embedding";
import { getActiveCv, getCv } from "@/server/cv/queries";
import { isTemplateCv } from "@/server/demo/template";
import { CvProfile, profileToText } from "@/server/cv/schemas";
import { jobListSelect, visibleJobWhere, type JobListItem } from "@/server/jobs/search";
import { consumeUsage, refundUsage } from "@/server/limits/usage";
import { DESCRIPTION_CHARS, rerankPrompt, rerankSystem } from "./prompts";
import { RerankResult } from "./schemas";
import { MAX_OUTPUT_TOKENS } from "@/server/ai/models";

export type MatchView = {
  job: JobListItem;
  vectorScore: number;
  score: number | null;
  matchedSkills: string[];
  gaps: string[];
  explanation: string | null;
};

export type MatchFilters = { remote?: boolean; location?: string };

/**
 * What happened to the AI re-rank on this call: `ok` (ran, or nothing needed scoring), `limit`
 * (daily limit reached), `failed` (AI error, budget or failure cooldown), `skipped` (a demo user on
 * the template CV).
 */
export type RerankStatus = "ok" | "limit" | "failed" | "skipped";

export type MatchesResult = { matches: MatchView[]; rerankStatus: RerankStatus };

const RECALL_LIMIT = 50;
const RERANK_BATCH = 10;
export const RERANK_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;

type RecallRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  remoteScope: string | null;
  source: JobSource;
  postedAt: Date | null;
  url: string | null;
  snippet: string;
  sim: number;
};

type Cached = {
  score: number | null;
  rerankedAt?: Date | null;
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
    const pattern = `%${escapeLike(location)}%`;
    extra.push(Prisma.sql`AND (j."location" ILIKE ${pattern} OR j."remoteScope" ILIKE ${pattern})`);
  }
  return db.$queryRaw<RecallRow[]>`
    SELECT j."id", j."title", j."company", j."location", j."remote", j."remoteScope",
           j."source"::text AS "source",
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
      remoteScope: row.remoteScope,
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
 * were never sent to the re-rank for this CV (results cached in MatchResult; a job the answer
 * left out is recorded as attempted and not sent again). If the re-rank cannot run (AI failure
 * or the daily limit), the usage unit is refunded and vector-only results are returned. After an
 * AI failure the CV's re-rank pauses for RERANK_FAILURE_COOLDOWN_MS.
 */
export async function findMatches(
  userId: string,
  isDemo: boolean,
  opts: { cvId?: string; filters?: MatchFilters } = {},
  deps: AiDeps = {},
): Promise<MatchesResult> {
  const { cv, profile } = await loadCv(userId, opts.cvId);
  // An analysis whose embedding failed is saved without one; embed it now (no AI usage).
  await ensureCvEmbedding(userId, cv.id, profile);
  const rows = await recall(userId, cv.id, opts.filters);
  if (rows.length === 0) return { matches: [], rerankStatus: "ok" };

  const cachedRows = await db.matchResult.findMany({
    where: { cvId: cv.id, jobId: { in: rows.map((r) => r.id) } },
  });
  const cached = new Map<string, Cached>(cachedRows.map((m) => [m.jobId, m]));

  const batch = rows.slice(0, RERANK_BATCH).filter((r) => {
    const c = cached.get(r.id);
    return c?.score == null && c?.rerankedAt == null;
  });
  let rerankStatus: RerankStatus = "ok";
  if (batch.length > 0) {
    // A demo user still on the cloned template CV sees the pre-scored matches instantly, with no
    // AI call: re-ranking resumes once they analyse their own CV.
    const coolingDown =
      cv.rerankFailedAt !== null &&
      Date.now() - cv.rerankFailedAt.getTime() < RERANK_FAILURE_COOLDOWN_MS;
    if (isDemo && isTemplateCv(cv)) rerankStatus = "skipped";
    else if (coolingDown) rerankStatus = "failed";
    else rerankStatus = await rerank(userId, isDemo, cv.id, profile, batch, cached, deps);
  }

  const views = rows.map((r) => toView(r, cached.get(r.id)));
  const ranked = views
    .filter((v) => v.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.vectorScore - a.vectorScore);
  const rest = views.filter((v) => v.score === null);
  return { matches: [...ranked, ...rest], rerankStatus };
}

/** One AI re-rank of `batch`; stores every sent job (scored or not) and updates `cached`. */
async function rerank(
  userId: string,
  isDemo: boolean,
  cvId: string,
  profile: CvProfile,
  batch: RecallRow[],
  cached: Map<string, Cached>,
  deps: AiDeps,
): Promise<RerankStatus> {
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
        maxOutputTokens: MAX_OUTPUT_TOKENS.rerank,
      },
      deps,
    );
    const returned = new Map(result.results.map((r) => [r.jobId, r]));
    const now = new Date();
    const stored = batch.map((row): [string, Cached & { vectorScore: number }] => {
      const r = returned.get(row.id);
      return [
        row.id,
        {
          vectorScore: row.sim,
          score: r ? Math.round(r.score) : null,
          matchedSkills: r?.matchedSkills ?? [],
          gaps: r?.gaps ?? [],
          explanation: r?.explanation ?? null,
          rerankedAt: now,
        },
      ];
    });
    await db.$transaction(
      stored.map(([jobId, data]) =>
        db.matchResult.upsert({
          where: { cvId_jobId: { cvId, jobId } },
          create: { cvId, jobId, ...data },
          update: data,
        }),
      ),
    );
    for (const [jobId, data] of stored) cached.set(jobId, data);
    return "ok";
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
    if (e instanceof LimitExceededError) return "limit";
    console.error("[matching] re-rank failed", describeError(e));
    if (e.code === "AI_FAILED") {
      await db.cv
        .updateMany({ where: { id: cvId, userId }, data: { rerankFailedAt: new Date() } })
        .catch((err: unknown) =>
          console.error("[matching] failed to store the failure time", describeError(err)),
        );
    }
    return "failed";
  }
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
