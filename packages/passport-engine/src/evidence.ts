import { z } from "zod";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ISOString } from "@odp/domain";

/**
 * Evidence maturity — what the bundle is allowed to claim about itself.
 * P0-2 bundles are FIXTURE only; the enum keeps later stages honest
 * (SIMULATED / PUBLIC-SOURCE / ONCHAIN).
 */
export const EvidenceMaturitySchema = z.enum(["FIXTURE", "SIMULATED", "PUBLIC-SOURCE", "ONCHAIN"]);
export type EvidenceMaturity = z.infer<typeof EvidenceMaturitySchema>;

/**
 * Machine-readable finding kinds extracted by collectors. A finding is the
 * smallest unit a collector maps onto a dimension status / warning /
 * unknown. The prose `detail` stays human evidence; findings are the rule
 * input. Ownership is enforced per dimension inside each collector.
 */
export const FindingKindSchema = z.enum([
  // TEAM
  "FOUNDERS_PUBLIC",
  "PRIOR_SHIPPED",
  "PARTIAL_IDENTITY",
  "UNKNOWN_OPERATORS",
  "ADVERSE_HISTORY",
  "PRIOR_FRAUD",
  // PRODUCT
  "LANDING_PAGE_ONLY",
  "REVENUE_EVIDENCE",
  "LIVE_MAINNET",
  "TESTNET_WORKING",
  "DEMO_AVAILABLE",
  "WHITEPAPER_ONLY",
  // CODE
  "THIRD_PARTY_AUDIT",
  "STALE_REPO",
  "ACTIVE_DEVELOPMENT",
  "NO_PUBLIC_CODE",
  "SOURCE_UNVERIFIED",
  // TOKEN
  "HONEYPOT_PATTERN",
  "MINT_AUTHORITY_RETAINED",
  "FREEZE_AUTHORITY_ACTIVE",
  "INSIDER_CONCENTRATION",
  "LIVE_TOKEN_PRE_PRODUCT",
  "MINT_AUTHORITY_REVOKED",
  "FREEZE_AUTHORITY_REVOKED",
  "LP_LOCKED",
  "NO_TRANSFER_TAX",
  // ONCHAIN
  "WASH_TRADING_LOOP",
  "ABNORMAL_TREASURY_MOVE",
  "TREASURY_MATCHES_SCHEDULE",
  "NO_ABNORMAL_FLOWS",
  // SOCIAL
  "BOT_DOMINANCE",
  "PAID_KOL_THREADS",
  "GROWTH_SPIKE_PAID",
  "ORGANIC_GROWTH",
  "LOW_BOT_RATIO",
]);
export type FindingKind = z.infer<typeof FindingKindSchema>;

/** One raw observation with its provenance and machine findings. */
export const ObservationSchema = z
  .object({
    source: z.string().min(1),
    detail: z.string().min(1),
    url: z.string().url().nullable().default(null),
    at: ISOString,
    findings: z.array(FindingKindSchema).min(1),
  })
  .strict();
export type Observation = z.infer<typeof ObservationSchema>;

/**
 * Raw evidence input for one project — NOT a PassportDims structure.
 * Collectors turn observations into dimensions; nothing here may declare
 * a dimension status, and certainly not an overall ruling.
 */
export const EvidenceBundleSchema = z
  .object({
    project_id: z.string().min(1),
    collected_at: ISOString,
    maturity: EvidenceMaturitySchema,
    observations: z
      .object({
        TEAM: z.array(ObservationSchema).default([]),
        PRODUCT: z.array(ObservationSchema).default([]),
        CODE: z.array(ObservationSchema).default([]),
        TOKEN: z.array(ObservationSchema).default([]),
        ONCHAIN: z.array(ObservationSchema).default([]),
        SOCIAL: z.array(ObservationSchema).default([]),
      })
      .strict(),
  })
  .strict();
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

export function loadEvidenceBundle(file: string): EvidenceBundle {
  return EvidenceBundleSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export function loadEvidenceBundles(dir: string): EvidenceBundle[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".evidence.json"))
    .sort()
    .map((f) => loadEvidenceBundle(path.join(dir, f)));
}
