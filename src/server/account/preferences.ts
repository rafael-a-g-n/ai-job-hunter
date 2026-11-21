import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export type PreferredLanguage = "en" | "pt";

export function parseLanguage(value: unknown): PreferredLanguage {
  return value === "pt" ? "pt" : "en";
}

/** The user's default AI output language; "en" if the user row is gone. */
export async function getPreferredLanguage(userId: string): Promise<PreferredLanguage> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { preferredLanguage: true },
  });
  return parseLanguage(user?.preferredLanguage);
}

export async function setPreferredLanguage(userId: string, value: string): Promise<void> {
  if (value !== "en" && value !== "pt") {
    throw new AppError("INVALID_INPUT", "Choose English or Portuguese.");
  }
  const { count } = await db.user.updateMany({
    where: { id: userId },
    data: { preferredLanguage: value },
  });
  if (count === 0) throw new AppError("NOT_FOUND", "Account not found.");
}
