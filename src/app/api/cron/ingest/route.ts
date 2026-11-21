import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runIngest } from "@/server/jobs/ingest";

export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await runIngest());
}
