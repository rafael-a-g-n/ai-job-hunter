"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteManualJob } from "@/server/jobs/manual";
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

export type DeleteJobResult = { ok: false; error: string };

/** Deletes the user's manual job and redirects to /jobs; returns only on failure. */
export async function deleteManualJobAction(jobId: string): Promise<DeleteJobResult> {
  const user = await requireUser();
  try {
    await deleteManualJob(user.id, jobId);
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.userMessage };
    console.error("[jobs] unexpected delete error", e instanceof Error ? e.name : "non-Error");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  revalidatePath("/jobs");
  redirect("/jobs");
}
