import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { postedAgo, sourceLabel } from "@/components/jobs/posted-ago";
import { DeleteJobButton } from "@/components/jobs/delete-job-button";
import { SaveButton } from "@/components/jobs/save-button";
import { MatchDetails } from "@/components/matching/match-details";
import { ScoreBadge } from "@/components/matching/score-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { safeExternalUrl } from "@/lib/safe-url";
import { requireUser } from "@/server/auth/session";
import { isJobSaved } from "@/server/jobs/saved";
import { getJob } from "@/server/jobs/search";
import { getMatchForJob } from "@/server/matching/match";

async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const job = await getJob(user.id, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [saved, match] = await Promise.all([
    isJobSaved(user.id, job.id),
    getMatchForJob(user.id, job.id),
  ]);
  const now = new Date();
  const jobUrl = safeExternalUrl(job.url);
  const canDelete = job.source === "MANUAL" && job.ownerId === user.id;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link href="/jobs" className="text-sm text-muted-foreground underline underline-offset-4">
          Back to jobs
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <h1 className="text-xl font-semibold">{job.title}</h1>
            <p className="text-sm text-muted-foreground">
              {job.company}
              {job.location ? ` - ${job.location}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {job.remote && <Badge>Remote</Badge>}
              <Badge variant="outline">{sourceLabel(job.source)}</Badge>
              <span>{postedAgo(job.postedAt, now)}</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            {canDelete && <DeleteJobButton jobId={job.id} />}
            <SaveButton jobId={job.id} initialSaved={saved} />
          </div>
        </div>
        {jobUrl && (
          <a
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline underline-offset-4"
          >
            View the original posting
          </a>
        )}
      </div>

      {match && match.score !== null && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Your match</CardTitle>
            <ScoreBadge score={match.score} />
          </CardHeader>
          <CardContent>
            <MatchDetails match={match} />
          </CardContent>
        </Card>
      )}
      {/* SLOT (Task 13): "Write cover letter" button goes here. */}

      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{job.description}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function JobDetailPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <JobDetail params={params} />
      </Suspense>
    </main>
  );
}
