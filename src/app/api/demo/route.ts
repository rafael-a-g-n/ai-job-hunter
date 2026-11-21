import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { clientIp, createDemoUser } from "@/server/demo/create-demo";
import { verifyTurnstile } from "@/server/demo/turnstile";

export const maxDuration = 60;

const Body = z.object({ turnstileToken: z.string().default("") });

function error(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, "INVALID_INPUT", "Invalid request.");

  const ip = clientIp(req.headers);
  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return error(403, "TURNSTILE_FAILED", "Verification failed. Please try again.");
  }

  try {
    const { userId } = await createDemoUser(ip);
    const { headers } = await auth.api.createDemoSession({
      body: { userId },
      returnHeaders: true,
    });
    const res = Response.json({ redirect: "/dashboard" });
    for (const cookie of headers.getSetCookie()) res.headers.append("set-cookie", cookie);
    return res;
  } catch (e) {
    if (e instanceof AppError && e.code === "DEMO_LIMIT") return error(429, e.code, e.userMessage);
    console.error("[demo] could not create a demo account", e instanceof Error ? e.name : "error");
    return error(500, "INTERNAL", "Could not start the demo. Please try again.");
  }
}
