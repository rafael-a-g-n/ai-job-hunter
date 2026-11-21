import type { UsageAction } from "@/generated/prisma/client";

export const LIMITS: Record<"user" | "demo", Record<UsageAction, number>> = {
  user: { CV_ANALYSIS: 3, COVER_LETTER: 10, MATCH_RERANK: 10, JOB_NORMALIZE: 10 },
  demo: { CV_ANALYSIS: 1, COVER_LETTER: 2, MATCH_RERANK: 3, JOB_NORMALIZE: 2 },
};

export function limitFor(action: UsageAction, isDemo: boolean): number {
  return LIMITS[isDemo ? "demo" : "user"][action];
}
