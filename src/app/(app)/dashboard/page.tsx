import Link from "next/link";
import { Suspense } from "react";
import { UsageSummary } from "@/components/app/usage-summary";
import { ScoreBadge } from "@/components/matching/score-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { getDashboard } from "@/server/dashboard";

async function DashboardContent() {
  const user = await requireUser();
  const d = await getDashboard(user.id, user.isDemo);
  const fmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Your CV</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {d.activeCv ? (
            <>
              <Link
                href={`/cv/${d.activeCv.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {d.activeCv.fileName}
              </Link>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{d.activeCv.status.toLowerCase()}</Badge>
                {d.activeCv.overallScore !== null && (
                  <span>
                    CV score <strong>{Math.round(d.activeCv.overallScore)}</strong> / 100
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <p>You have not uploaded a CV yet.</p>
              <div>
                <Link href="/cv" className={buttonVariants({ size: "sm" })}>
                  Upload your CV
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s usage</CardTitle>
        </CardHeader>
        <CardContent>
          <UsageSummary usage={d.usage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top matches</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {d.topMatches.length === 0 ? (
            <p>No scored matches yet. Open Matches to find jobs that fit your CV.</p>
          ) : (
            <ul className="divide-y">
              {d.topMatches.map((m) => (
                <li key={m.job.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/jobs/${m.job.id}`}
                    className="grid underline-offset-4 hover:underline"
                  >
                    <span className="font-medium">{m.job.title}</span>
                    <span className="text-muted-foreground">{m.job.company}</span>
                  </Link>
                  {m.score !== null && <ScoreBadge score={m.score} />}
                </li>
              ))}
            </ul>
          )}
          <Link href="/jobs/matches" className="underline underline-offset-4">
            See all matches
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent cover letters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {d.recentLetters.length === 0 ? (
            <p>No cover letters yet. Open a job and choose &quot;Write cover letter&quot;.</p>
          ) : (
            <ul className="divide-y">
              {d.recentLetters.map((l) => (
                <li key={l.id} className="py-2">
                  <Link
                    href={`/letters/${l.id}`}
                    className="grid underline-offset-4 hover:underline"
                  >
                    <span className="font-medium">{l.jobTitle}</span>
                    <span className="text-muted-foreground">
                      {l.company} - {fmt.format(l.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground">
            {d.savedJobsCount} saved {d.savedJobsCount === 1 ? "job" : "jobs"} ·{" "}
            <Link href="/jobs" className="underline underline-offset-4">
              Browse jobs
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
