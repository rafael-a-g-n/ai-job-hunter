import Link from "next/link";
import { Suspense } from "react";
import { MatchCard } from "@/components/matching/match-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppError } from "@/lib/errors";
import { EmptyState } from "@/components/app/empty-state";
import { requireUser } from "@/server/auth/session";
import { findMatches, type MatchesResult, type RerankStatus } from "@/server/matching/match";
import { PageSkeleton } from "@/components/app/page-skeleton";

// Rendering may run an AI re-rank (and a lazy CV embedding).
export const maxDuration = 60;

function NoCv() {
  return (
    <Card>
      <CardContent className="grid justify-items-start gap-3">
        <p className="text-sm">Upload and analyse your CV to see the jobs that fit it best.</p>
        <Link href="/cv" className={buttonVariants()}>
          Go to your CV
        </Link>
      </CardContent>
    </Card>
  );
}

const RERANK_NOTICE: Record<RerankStatus, string | null> = {
  ok: null,
  skipped: null,
  limit:
    "Daily AI scoring limit reached, so new jobs are ordered by similarity only. Limits reset at 00:00 UTC.",
  failed: "AI scoring is unavailable right now, so new jobs are ordered by similarity only.",
};

async function Matches() {
  const user = await requireUser();
  let result: MatchesResult;
  try {
    result = await findMatches(user.id, user.isDemo);
  } catch (e) {
    if (e instanceof AppError && e.code === "CV_NOT_READY") return <NoCv />;
    if (e instanceof AppError && e.code === "EMBEDDING_FAILED") {
      return <EmptyState>Matching is unavailable right now. Try again in a minute.</EmptyState>;
    }
    throw e;
  }
  const { matches, rerankStatus } = result;
  if (matches.length === 0) {
    return <EmptyState>No jobs to match yet. Check back after the next job update.</EmptyState>;
  }
  const now = new Date();
  const notice = RERANK_NOTICE[rerankStatus];
  return (
    <>
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      <ul className="grid gap-3">
        {matches.map((m) => (
          <li key={m.job.id}>
            <MatchCard match={m} now={now} />
          </li>
        ))}
      </ul>
    </>
  );
}

export default function MatchesPage() {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Best matches</h1>
        <Link href="/jobs" className="text-sm underline underline-offset-4">
          All jobs
        </Link>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Matches />
      </Suspense>
    </main>
  );
}
