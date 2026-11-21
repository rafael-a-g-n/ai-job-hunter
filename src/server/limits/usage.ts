import type { UsageAction } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, LimitExceededError } from "@/lib/errors";
import { LIMITS, limitFor } from "./config";

/**
 * Atomically consumes one unit. A single INSERT ... ON CONFLICT DO UPDATE ... WHERE
 * statement, so parallel calls can never push the counter past the limit.
 */
export async function consumeUsage(
  userId: string,
  action: UsageAction,
  isDemo: boolean,
): Promise<{ remaining: number }> {
  const limit = limitFor(action, isDemo);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "UsageCounter" ("userId", "action", "day", "count")
    SELECT ${userId}, ${action}::"UsageAction", (now() AT TIME ZONE 'UTC')::date, 1
    WHERE ${limit}::int >= 1
    ON CONFLICT ("userId", "action", "day")
    DO UPDATE SET "count" = "UsageCounter"."count" + 1
    WHERE "UsageCounter"."count" < ${limit}::int
    RETURNING "count"`;
  if (rows.length === 0) throw new LimitExceededError(action, limit);
  return { remaining: limit - rows[0].count };
}

/** Gives back one unit for today (floor 0). */
export async function refundUsage(userId: string, action: UsageAction): Promise<void> {
  await db.$executeRaw`
    UPDATE "UsageCounter" SET "count" = GREATEST("count" - 1, 0)
    WHERE "userId" = ${userId} AND "action" = ${action}::"UsageAction"
      AND "day" = (now() AT TIME ZONE 'UTC')::date`;
}

export async function getUsageSummary(
  userId: string,
  isDemo: boolean,
): Promise<Record<UsageAction, { used: number; limit: number }>> {
  const rows = await db.$queryRaw<{ action: UsageAction; count: number }[]>`
    SELECT "action"::text AS "action", "count" FROM "UsageCounter"
    WHERE "userId" = ${userId} AND "day" = (now() AT TIME ZONE 'UTC')::date`;
  const used = new Map(rows.map((r) => [r.action, r.count]));
  const limits = LIMITS[isDemo ? "demo" : "user"];
  const summary = {} as Record<UsageAction, { used: number; limit: number }>;
  for (const action of Object.keys(limits) as UsageAction[]) {
    summary[action] = { used: used.get(action) ?? 0, limit: limits[action] };
  }
  return summary;
}

export async function assertGlobalBudget(): Promise<void> {
  const rows = await db.$queryRaw<{ total: string }[]>`
    SELECT COALESCE(SUM("costUsd"), 0)::text AS total FROM "AiCall"
    WHERE "createdAt" >= ${utcDayStart()}`;
  if (Number(rows[0].total) >= env.GLOBAL_DAILY_AI_BUDGET_USD) {
    throw new AppError(
      "BUDGET_EXHAUSTED",
      "The demo has reached today's AI budget. Please try again tomorrow.",
    );
  }
}

function utcDayStart(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
