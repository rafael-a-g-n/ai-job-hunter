import { z } from "zod";

export const RerankResult = z.object({
  results: z.array(
    z.object({
      jobId: z.string(),
      // Rounded when stored: a model answering 87.5 should not fail the whole re-rank.
      score: z.number().min(0).max(100),
      matchedSkills: z.array(z.string()),
      gaps: z.array(z.string()),
      explanation: z.string(),
    }),
  ),
});
export type RerankResult = z.infer<typeof RerankResult>;
