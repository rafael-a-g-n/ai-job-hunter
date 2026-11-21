"use server";

import { redirect } from "next/navigation";
import { AppError, LimitExceededError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { createManualJob } from "@/server/jobs/manual";

export type ManualJobResult = { ok: false; error: string };

function message(e: unknown): string {
  if (e instanceof LimitExceededError) {
    return `You've used today's ${e.limit} job imports. Limits reset at 00:00 UTC.`;
  }
  if (e instanceof AppError) return e.userMessage;
  console.error("[jobs] unexpected import error", e instanceof Error ? e.name : "non-Error");
  return "Something went wrong. Please try again.";
}

/** Creates the job and redirects to it; returns only on failure. */
export async function createManualJobAction(formData: FormData): Promise<ManualJobResult> {
  const user = await requireUser();
  const text = formData.get("text");
  const url = formData.get("url");
  let jobId: string;
  try {
    const job = await createManualJob(user.id, user.isDemo, {
      text: typeof text === "string" ? text : "",
      url: typeof url === "string" ? url : undefined,
    });
    jobId = job.id;
  } catch (e) {
    return { ok: false, error: message(e) };
  }
  redirect(`/jobs/${jobId}`);
}
