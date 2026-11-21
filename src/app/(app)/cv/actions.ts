"use server";

import { revalidatePath } from "next/cache";
import { AppError, LimitExceededError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { analyzeCv, updateCvProfile } from "@/server/cv/analyze";
import type { AnalysisLanguage } from "@/server/cv/prompts";
import { CvProfile } from "@/server/cv/schemas";
import { uploadCv } from "@/server/cv/upload";

export type ActionResult = { ok: true; cvId: string } | { ok: false; error: string; cvId?: string };

function message(e: unknown): string {
  if (e instanceof LimitExceededError) {
    return `You've used today's ${e.limit} analyses. Limits reset at 00:00 UTC.`;
  }
  if (e instanceof AppError) return e.userMessage;
  console.error("[cv] unexpected action error", e instanceof Error ? e.name : "non-Error");
  return "Something went wrong. Please try again.";
}

function toLanguage(value: unknown): AnalysisLanguage {
  return value === "pt" ? "pt" : "en";
}

/** Stores the uploaded file, then analyses it. The CV id is returned even when analysis fails. */
export async function uploadCvAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a PDF or DOCX file." };
  }
  let cvId: string | undefined;
  try {
    const cv = await uploadCv(user.id, {
      name: file.name,
      type: file.type,
      size: file.size,
      data: Buffer.from(await file.arrayBuffer()),
    });
    cvId = cv.id;
    if (cv.status === "FAILED") {
      return { ok: false, error: cv.failureReason ?? "We couldn't read this file.", cvId };
    }
    await analyzeCv(user.id, cv.id, toLanguage(formData.get("language")));
    revalidatePath("/cv");
    return { ok: true, cvId };
  } catch (e) {
    revalidatePath("/cv");
    return { ok: false, error: message(e), cvId };
  }
}

export async function analyzeCvAction(cvId: string, language: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await analyzeCv(user.id, cvId, toLanguage(language));
    revalidatePath(`/cv/${cvId}`);
    return { ok: true, cvId };
  } catch (e) {
    revalidatePath(`/cv/${cvId}`);
    return { ok: false, error: message(e), cvId };
  }
}

export async function saveProfileAction(cvId: string, profile: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = CvProfile.safeParse(profile);
  if (!parsed.success) return { ok: false, error: "Some profile fields are invalid.", cvId };
  try {
    await updateCvProfile(user.id, cvId, parsed.data);
    revalidatePath(`/cv/${cvId}`);
    return { ok: true, cvId };
  } catch (e) {
    return { ok: false, error: message(e), cvId };
  }
}
