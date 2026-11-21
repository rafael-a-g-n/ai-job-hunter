import { db } from "@/lib/db";
import { getActiveCv } from "@/server/cv/queries";
import { CvAnalysis } from "@/server/cv/schemas";
import { getUsageSummary } from "@/server/limits/usage";
import { listCachedMatches, type MatchView } from "@/server/matching/match";

const LIST_LIMIT = 5;

export type Dashboard = {
  activeCv: { id: string; fileName: string; status: string; overallScore: number | null } | null;
  topMatches: MatchView[];
  recentLetters: { id: string; jobTitle: string; company: string; createdAt: Date }[];
  savedJobsCount: number;
  usage: Awaited<ReturnType<typeof getUsageSummary>>;
};

/** Everything the dashboard shows. Reads only; makes no AI call and consumes no usage. */
export async function getDashboard(userId: string, isDemo: boolean): Promise<Dashboard> {
  const cv = await getActiveCv(userId);
  const [topMatches, letters, savedJobsCount, usage] = await Promise.all([
    cv ? listCachedMatches(userId, cv.id, LIST_LIMIT) : Promise.resolve([]),
    db.coverLetter.findMany({
      where: { userId },
      select: { id: true, createdAt: true, job: { select: { title: true, company: true } } },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
    db.savedJob.count({ where: { userId } }),
    getUsageSummary(userId, isDemo),
  ]);
  const analysis = cv ? CvAnalysis.safeParse(cv.analysis) : null;
  return {
    activeCv: cv
      ? {
          id: cv.id,
          fileName: cv.fileName,
          status: cv.status,
          overallScore: analysis?.success ? analysis.data.overallScore : null,
        }
      : null,
    topMatches,
    recentLetters: letters.map((l) => ({
      id: l.id,
      jobTitle: l.job.title,
      company: l.job.company,
      createdAt: l.createdAt,
    })),
    savedJobsCount,
    usage,
  };
}
