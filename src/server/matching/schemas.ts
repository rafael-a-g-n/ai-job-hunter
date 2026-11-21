import { z } from "zod";

export const RerankResult = z.object({
  results: z.array(
    z.object({
      jobId: z.string(),
      score: z.number().int().min(0).max(100),
      matchedSkills: z.array(z.string()),
      gaps: z.array(z.string()),
      explanation: z.string(),
    }),
  ),
});
export type RerankResult = z.infer<typeof RerankResult>;
