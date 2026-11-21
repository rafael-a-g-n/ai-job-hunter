import type { UsageAction } from "@/generated/prisma/client";

const LABELS: Record<UsageAction, string> = {
  CV_ANALYSIS: "CV analyses",
  COVER_LETTER: "Cover letters",
  MATCH_RERANK: "Match re-ranks",
  JOB_NORMALIZE: "Manual job imports",
};

/** Today's used/limit per action. Limits reset at 00:00 UTC. */
export function UsageSummary({
  usage,
}: {
  usage: Record<UsageAction, { used: number; limit: number }>;
}) {
  return (
    <div className="grid gap-2">
      <ul className="grid gap-1 text-sm">
        {(Object.keys(LABELS) as UsageAction[]).map((action) => (
          <li key={action} className="flex justify-between">
            <span>{LABELS[action]}</span>
            <span className="tabular-nums text-muted-foreground">
              {usage[action].used} / {usage[action].limit}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Limits reset at 00:00 UTC.</p>
    </div>
  );
}
