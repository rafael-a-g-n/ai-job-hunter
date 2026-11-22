import Link from "next/link";
import { postedAgo, remoteBadgeText, sourceLabel } from "@/components/jobs/posted-ago";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { MatchView } from "@/server/matching/match";
import { MatchDetails } from "./match-details";
import { ScoreBadge } from "./score-badge";

export function MatchCard({ match, now }: { match: MatchView; now: Date }) {
  const { job } = match;
  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <Link
              href={`/jobs/${job.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
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
          {match.score === null ? (
            <span className="text-xs text-muted-foreground">
              Similarity {Math.round(match.vectorScore * 100)}%
            </span>
          ) : (
            <ScoreBadge score={match.score} />
          )}
        </div>
        {match.score !== null && <MatchDetails match={match} />}
      </CardContent>
    </Card>
  );
}
