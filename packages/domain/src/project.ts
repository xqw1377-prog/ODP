import { z } from "zod";
import { ISOString } from "./util.js";

export const DiscoverySourceSchema = z.enum([
  "social",
  "onchain",
  "developer",
  "capital",
  "network",
]);
export type DiscoverySource = z.infer<typeof DiscoverySourceSchema>;

/**
 * Output of the Discovery Engine. P0 fills it via seed / semi-automatic
 * capture / fixtures; the shape is final for automated discovery later.
 */
export const ProjectCandidateSchema = z.object({
  project_id: z.string().min(1),
  name: z.string().min(1),
  symbol: z.string().min(1),
  website: z.string().url(),
  x_account: z.string().min(1),
  github: z.string().url().nullable().default(null),
  chain: z.string().min(1),
  token_address: z.string().min(1).nullable().default(null),
  discovered_at: ISOString,
  discovery_sources: z.array(DiscoverySourceSchema).min(1),
});
export type ProjectCandidate = z.infer<typeof ProjectCandidateSchema>;
