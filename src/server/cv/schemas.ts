import { z } from "zod";

export const SENIORITIES = ["intern", "junior", "mid", "senior", "lead"] as const;
export const SKILL_CATEGORIES = ["technical", "soft", "tool", "language"] as const;

export const CvProfile = z.object({
  fullName: z.string().min(1).max(200),
  headline: z.string().max(300),
  seniority: z.enum(SENIORITIES),
  yearsExperience: z.number().min(0).max(60),
  location: z.string().max(200).nullable(),
  languages: z.array(z.object({ name: z.string().max(100), level: z.string().max(100) })).max(20),
  skills: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        category: z.enum(SKILL_CATEGORIES),
        level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      }),
    )
    .max(80),
  experience: z
    .array(
      z.object({
        title: z.string().max(200),
        company: z.string().max(200),
        start: z.string().max(50),
        end: z.string().max(50).nullable(),
        highlights: z.array(z.string().max(1000)).max(20),
      }),
    )
    .max(30),
  education: z
    .array(
      z.object({
        degree: z.string().max(200),
        institution: z.string().max(200),
        year: z.string().max(50).nullable(),
      }),
    )
    .max(15),
  preferences: z.object({
    remote: z.boolean().nullable(),
    roles: z.array(z.string().max(100)).max(20),
  }),
});
export type CvProfile = z.infer<typeof CvProfile>;

const Section = z.object({ score: z.number().min(0).max(100), comment: z.string() });

export const CvAnalysis = z.object({
  overallScore: z.number().min(0).max(100),
  sections: z.object({
    clarity: Section,
    impact: Section,
    atsCompatibility: Section,
    skills: Section,
  }),
  strengths: z.array(z.string()).min(1).max(5),
  improvements: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        example: z.string().nullable(),
      }),
    )
    .min(1)
    .max(8),
});
export type CvAnalysis = z.infer<typeof CvAnalysis>;

export const CvAnalysisResult = z.object({ profile: CvProfile, analysis: CvAnalysis });
export type CvAnalysisResult = z.infer<typeof CvAnalysisResult>;

/** Text embedded for matching: headline, seniority, skills and experience titles/highlights. */
export function profileToText(p: CvProfile): string {
  const lines = [
    `${p.headline} (${p.seniority}, ${p.yearsExperience} years)`,
    `Skills: ${p.skills.map((s) => s.name).join(", ")}`,
    ...p.experience.flatMap((e) => [`${e.title} at ${e.company}`, ...e.highlights]),
  ];
  return lines.join("\n");
}
