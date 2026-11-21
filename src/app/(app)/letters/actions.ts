"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { deleteLetter, updateLetter } from "@/server/letters/crud";

export type LetterActionResult = { ok: true } | { ok: false; error: string };

function toResult(e: unknown): LetterActionResult {
  if (e instanceof AppError) return { ok: false, error: e.userMessage };
  console.error("[letters] unexpected action error", e instanceof Error ? e.name : "non-Error");
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function updateLetterAction(id: string, content: string): Promise<LetterActionResult> {
  const user = await requireUser();
  try {
    await updateLetter(user.id, id, content);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

/** Deletes the letter and redirects to /letters; returns only on failure. */
export async function deleteLetterAction(id: string): Promise<LetterActionResult> {
  const user = await requireUser();
  try {
    await deleteLetter(user.id, id);
  } catch (e) {
    return toResult(e);
  }
  revalidatePath("/letters");
  redirect("/letters");
}
