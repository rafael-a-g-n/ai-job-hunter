"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/server/auth/session";
import { deleteAccount } from "@/server/account/delete-account";
import { setPreferredLanguage } from "@/server/account/preferences";

export type SettingsResult = { ok: true } | { ok: false; error: string };

function message(e: unknown): string {
  if (e instanceof AppError) return e.userMessage;
  console.error("[settings] unexpected action error", e instanceof Error ? e.name : "non-Error");
  return "Something went wrong. Please try again.";
}

export async function updateLanguageAction(language: string): Promise<SettingsResult> {
  const user = await requireUser();
  try {
    await setPreferredLanguage(user.id, language);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Deletes the signed-in account. The client signs out and leaves afterwards. */
export async function deleteAccountAction(confirmation: string): Promise<SettingsResult> {
  const user = await requireUser();
  if (confirmation !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  try {
    await deleteAccount(user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
