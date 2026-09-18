import { z } from "zod";

export const RiskFlagSchema = z.enum([
  "SYBIL",
  "BOT",
  "FARMING",
  "MANIPULATION",
  "FAKE_ENGAGEMENT",
  "WALLET_CLUSTER",
]);
export type RiskFlag = z.infer<typeof RiskFlagSchema>;

/**
 * P0 identity = X identity + Solana wallet (fixture-backed).
 * The x_oauth boundary is reserved: `ODP_HUMAN_SOURCE=fixture | x_oauth`.
 * Frozen contract: strict — unknown fields are rejected.
 */
export const HumanProfileSchema = z
  .object({
    human_id: z.string().min(1),
    x_id: z.string().min(1),
    wallet: z.string().min(1),
    human_confidence: z.number().min(0).max(1),
    reputation: z.number().min(0).max(1),
    network_score: z.number().min(0).max(1),
    interest_tags: z.array(z.string().min(1)).min(1),
    risk_flags: z.array(RiskFlagSchema).default([]),
  })
  .strict();
export type HumanProfile = z.infer<typeof HumanProfileSchema>;
