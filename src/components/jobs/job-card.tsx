import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { JobListItem } from "@/server/jobs/search";
import { postedAgo, remoteBadgeText, sourceLabel } from "./posted-ago";
import { SaveButton } from "./save-button";

export function JobCard({ job, saved, now }: { job: JobListItem; saved: boolean; now: Date }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <Link href={`/jobs/${job.id}`} className="font-medium underline-offset-4 hover:underline">
            {job.title}
          </Link>
          <p className="text-sm text-muted-foreground">
            {job.company}
            {job.location ? ` - ${job.location}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {remoteBadgeText(job) && <Badge>{remoteBadgeText(job)}</Badge>}
            <Badge variant="outline">{sourceLabel(job.source)}</Badge>
            <span>{postedAgo(job.postedAt, now)}</span>
          </div>
        </div>
        <SaveButton jobId={job.id} initialSaved={saved} />
      </CardContent>
    </Card>
  );
}
