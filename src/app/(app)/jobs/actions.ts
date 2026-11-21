"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { toggleSavedJob } from "@/server/jobs/saved";

export type ToggleSavedResult = { ok: true; saved: boolean } | { ok: false; error: string };

export async function toggleSavedJobAction(jobId: string): Promise<ToggleSavedResult> {
  const user = await requireUser();
  try {
    const { saved } = await toggleSavedJob(user.id, jobId);
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true, saved };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.userMessage };
    console.error("[jobs] unexpected toggle error", e instanceof Error ? e.name : "non-Error");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
