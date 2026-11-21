import { z } from "zod";
import { LetterLength, Tone } from "@/generated/prisma/client";
import { CvAnalysis, CvProfile } from "@/server/cv/schemas";

/** What a new demo account is pre-filled with: a CV, three saved jobs and one cover letter. */
export const DemoTemplate = z
  .object({
    cv: z.object({
      fileName: z.string().min(1),
      rawText: z.string().min(1),
      profile: CvProfile,
      analysis: CvAnalysis,
      /** The CV file, base64-encoded. */
      blob: z.string().min(1),
    }),
    savedJobDedupeHashes: z.array(z.string().min(1)).length(3),
    /** Pre-generated AI scores, so a demo account shows real match results with no AI call.
     * Covers the best-matching jobs, saved or not; jobs missing from the database are skipped. */
    matches: z
      .array(
        z.object({
          jobDedupeHash: z.string().min(1),
          score: z.number().int().min(0).max(100),
          matchedSkills: z.array(z.string()),
          gaps: z.array(z.string()),
          explanation: z.string(),
        }),
      )
      .optional(),
    letter: z.object({
      jobDedupeHash: z.string().min(1),
      tone: z.enum(Tone),
      language: z.enum(["en", "pt"]),
      length: z.enum(LetterLength),
      content: z.string().min(1),
    }),
  })
  .refine((t) => t.savedJobDedupeHashes.includes(t.letter.jobDedupeHash), {
    path: ["letter", "jobDedupeHash"],
    message: "The letter must be for one of the saved jobs",
  });
export type DemoTemplate = z.infer<typeof DemoTemplate>;
