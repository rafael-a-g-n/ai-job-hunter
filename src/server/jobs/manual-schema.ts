import { z } from "zod";
import { safeExternalUrl } from "@/lib/safe-url";

export const MANUAL_TEXT_MIN = 50;
export const MANUAL_TEXT_MAX = 20_000;

export const ManualJobInput = z.object({
  text: z
    .string()
    .trim()
    .min(MANUAL_TEXT_MIN, `Paste at least ${MANUAL_TEXT_MIN} characters of the job description.`)
    .max(MANUAL_TEXT_MAX, `The job description is too long (max ${MANUAL_TEXT_MAX} characters).`),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((u) => safeExternalUrl(u) !== null, "Enter a valid http or https URL.")
    .optional(),
});
export type ManualJobInput = z.infer<typeof ManualJobInput>;

/** What the AI returns for a pasted posting. */
export const NormalizedManualJob = z.object({
  title: z.string(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  remote: z.boolean(),
  description: z.string(),
});
export type NormalizedManualJob = z.infer<typeof NormalizedManualJob>;
