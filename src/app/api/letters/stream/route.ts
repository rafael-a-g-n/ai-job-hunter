import { z } from "zod";
import { AppError, LimitExceededError, NotFoundError } from "@/lib/errors";
import { getUserFromHeaders } from "@/server/auth/session";
import { streamLetter } from "@/server/letters/generate";

export const maxDuration = 60;

const Body = z.object({
  jobId: z.string().min(1),
  tone: z.enum(["FORMAL", "NEUTRAL", "ENTHUSIASTIC"]),
  language: z.enum(["en", "pt"]),
  length: z.enum(["SHORT", "MEDIUM", "LONG"]),
});

function errorResponse(status: number, code: string, message: string, limit?: number): Response {
  const error = limit === undefined ? { code, message } : { code, message, limit };
  return Response.json({ error }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const user = await getUserFromHeaders(req.headers);
  if (!user) return errorResponse(401, "UNAUTHORIZED", "Please sign in.");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "INVALID_INPUT", "Invalid request.");

  try {
    return await streamLetter(user, parsed.data);
  } catch (e) {
    if (e instanceof LimitExceededError) {
      return errorResponse(429, e.code, e.userMessage, e.limit);
    }
    if (e instanceof NotFoundError) return errorResponse(404, e.code, e.userMessage);
    if (e instanceof AppError) {
      if (e.code === "CV_NOT_READY") return errorResponse(409, e.code, e.userMessage);
      if (e.code === "BUDGET_EXHAUSTED") return errorResponse(503, e.code, e.userMessage);
      return errorResponse(500, e.code, e.userMessage);
    }
    console.error("[letters] unexpected stream error", e instanceof Error ? e.name : "non-Error");
    return errorResponse(500, "INTERNAL", "Something went wrong. Please try again.");
  }
}
