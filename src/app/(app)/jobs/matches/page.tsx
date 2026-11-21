import Link from "next/link";
import { Suspense } from "react";
import { MatchCard } from "@/components/matching/match-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { findMatches, type MatchView } from "@/server/matching/match";

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

async function Matches() {
  const user = await requireUser();
  let matches: MatchView[];
  try {
    matches = await findMatches(user.id, user.isDemo);
  } catch (e) {
    if (e instanceof AppError && e.code === "CV_NOT_READY") return <NoCv />;
    throw e;
  }
  if (matches.length === 0) {
    return <p className="text-sm">No jobs to match yet. Check back after the next job update.</p>;
  }
  const now = new Date();
  const reranked = matches.some((m) => m.score !== null);
  return (
    <>
      {!reranked && (
        <p className="text-sm text-muted-foreground">
          AI scoring is unavailable right now, so these jobs are ordered by similarity only.
        </p>
      )}
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
      <Suspense fallback={<p className="text-sm text-muted-foreground">Finding your matches...</p>}>
        <Matches />
      </Suspense>
    </main>
  );
}
