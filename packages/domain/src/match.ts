import { z } from "zod";

/**
 * Output of the Matching Engine (P0-3). `match_reasons` must be non-empty —
 * the frontend renders them as "Why you were selected". A bare score is a
 * schema violation, not just a UI shortcoming.
 */
export const MatchResultSchema = z.object({
  project_id: z.string().min(1),
  human_id: z.string().min(1),
  match_score: z.number().min(0).max(1),
  match_reasons: z.array(z.string().min(1)).min(1),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;
