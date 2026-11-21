import { z } from "zod";

export const SENIORITIES = ["intern", "junior", "mid", "senior", "lead"] as const;
export const SKILL_CATEGORIES = ["technical", "soft", "tool", "language"] as const;

/** Most items kept per list; the AI's answer is clamped to these (see clampAnalysisResult). */
export const LIST_LIMITS = {
  languages: 20,
  skills: 80,
  experience: 30,
  highlights: 20,
  education: 15,
  roles: 20,
  strengths: 5,
  improvements: 8,
} as const;

type Limit = keyof typeof LIST_LIMITS;

/** `strict` caps list lengths; the lenient variant (for parsing AI output) does not. */
function listOf<T extends z.ZodType>(item: T, limit: Limit, strict: boolean) {
  const list = z.array(item);
  return strict ? list.max(LIST_LIMITS[limit]) : list;
}

function profileSchema(strict: boolean) {
  return z.object({
    fullName: z.string().min(1).max(200),
    headline: z.string().max(300),
    seniority: z.enum(SENIORITIES),
    yearsExperience: z.number().min(0).max(60),
    location: z.string().max(200).nullable(),
    languages: listOf(
      z.object({ name: z.string().max(100), level: z.string().max(100) }),
      "languages",
      strict,
    ),
    skills: listOf(
      z.object({
        name: z.string().min(1).max(100),
        category: z.enum(SKILL_CATEGORIES),
        level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      }),
      "skills",
      strict,
    ),
    experience: listOf(
      z.object({
        title: z.string().max(200),
        company: z.string().max(200),
        start: z.string().max(50),
        end: z.string().max(50).nullable(),
        highlights: listOf(z.string().max(1000), "highlights", strict),
      }),
      "experience",
      strict,
    ),
    education: listOf(
      z.object({
        degree: z.string().max(200),
        institution: z.string().max(200),
        year: z.string().max(50).nullable(),
      }),
      "education",
      strict,
    ),
    preferences: z.object({
      remote: z.boolean().nullable(),
      roles: listOf(z.string().max(100), "roles", strict),
    }),
  });
}

const Section = z.object({ score: z.number().min(0).max(100), comment: z.string() });

function analysisSchema(strict: boolean) {
  return z.object({
    overallScore: z.number().min(0).max(100),
    sections: z.object({
      clarity: Section,
      impact: Section,
      atsCompatibility: Section,
      skills: Section,
    }),
    strengths: listOf(z.string(), "strengths", strict).min(1),
    improvements: listOf(
      z.object({
        title: z.string(),
        detail: z.string(),
        example: z.string().nullable(),
      }),
      "improvements",
      strict,
    ).min(1),
  });
}

export const CvProfile = profileSchema(true);
export type CvProfile = z.infer<typeof CvProfile>;

export const CvAnalysis = analysisSchema(true);
export type CvAnalysis = z.infer<typeof CvAnalysis>;

export const CvAnalysisResult = z.object({ profile: CvProfile, analysis: CvAnalysis });
export type CvAnalysisResult = z.infer<typeof CvAnalysisResult>;

/**
 * What the AI is asked for: the same shape without list-length caps, so a rich CV (say, 90
 * skills) is not rejected and retried. Clamp it with clampAnalysisResult before storing.
 */
export const CvAnalysisAiResult = z.object({
  profile: profileSchema(false),
  analysis: analysisSchema(false),
});
export type CvAnalysisAiResult = z.infer<typeof CvAnalysisAiResult>;

/** Cuts every list to LIST_LIMITS, then validates against the strict schema. */
export function clampAnalysisResult(r: CvAnalysisAiResult): CvAnalysisResult {
  const { profile: p, analysis: a } = r;
  const cut = <T>(list: T[], limit: Limit) => list.slice(0, LIST_LIMITS[limit]);
  return CvAnalysisResult.parse({
    profile: {
      ...p,
      languages: cut(p.languages, "languages"),
      skills: cut(p.skills, "skills"),
      experience: cut(p.experience, "experience").map((e) => ({
        ...e,
        highlights: cut(e.highlights, "highlights"),
      })),
      education: cut(p.education, "education"),
      preferences: { ...p.preferences, roles: cut(p.preferences.roles, "roles") },
    },
    analysis: {
      ...a,
      strengths: cut(a.strengths, "strengths"),
      improvements: cut(a.improvements, "improvements"),
    },
  });
}

/** Text embedded for matching: headline, seniority, skills and experience titles/highlights. */
export function profileToText(p: CvProfile): string {
  const lines = [
    `${p.headline} (${p.seniority}, ${p.yearsExperience} years)`,
    `Skills: ${p.skills.map((s) => s.name).join(", ")}`,
    ...p.experience.flatMap((e) => [`${e.title} at ${e.company}`, ...e.highlights]),
  ];
  return lines.join("\n");
}
