import type { FindingKind } from "@odp/passport-engine";
import type { Dimension } from "./schema.js";

/* Local finding-kind → dimension ownership map. The frozen collectors enforce
   this at generation time (wrong-dimension findings throw), but intake should
   reject early with a clean message. The drift test in tests/finding-ownership
   .test.ts feeds every entry here through the real collectors, so if the
   frozen map ever changes, CI fails here first. */

export const FINDING_OWNERSHIP: Record<Dimension, readonly FindingKind[]> = {
  TEAM: [
    "FOUNDERS_PUBLIC",
    "PRIOR_SHIPPED",
    "PARTIAL_IDENTITY",
    "UNKNOWN_OPERATORS",
    "ADVERSE_HISTORY",
    "PRIOR_FRAUD",
  ],
  PRODUCT: [
    "LANDING_PAGE_ONLY",
    "REVENUE_EVIDENCE",
    "LIVE_MAINNET",
    "TESTNET_WORKING",
    "DEMO_AVAILABLE",
    "WHITEPAPER_ONLY",
  ],
  CODE: ["THIRD_PARTY_AUDIT", "STALE_REPO", "ACTIVE_DEVELOPMENT", "NO_PUBLIC_CODE", "SOURCE_UNVERIFIED"],
  TOKEN: [
    "HONEYPOT_PATTERN",
    "MINT_AUTHORITY_RETAINED",
    "FREEZE_AUTHORITY_ACTIVE",
    "INSIDER_CONCENTRATION",
    "LIVE_TOKEN_PRE_PRODUCT",
    "MINT_AUTHORITY_REVOKED",
    "FREEZE_AUTHORITY_REVOKED",
    "LP_LOCKED",
    "NO_TRANSFER_TAX",
  ],
  ONCHAIN: ["WASH_TRADING_LOOP", "ABNORMAL_TREASURY_MOVE", "TREASURY_MATCHES_SCHEDULE", "NO_ABNORMAL_FLOWS"],
  SOCIAL: ["BOT_DOMINANCE", "PAID_KOL_THREADS", "GROWTH_SPIKE_PAID", "ORGANIC_GROWTH", "LOW_BOT_RATIO"],
};

const BY_KIND = new Map<string, Dimension>(Object.entries(FINDING_OWNERSHIP).flatMap(([dim, kinds]) => kinds.map((k) => [k, dim as Dimension])));

export function dimensionOfFinding(kind: FindingKind): Dimension | null {
  return BY_KIND.get(kind) ?? null;
}

export function foreignFindings(dimension: Dimension, kinds: FindingKind[]): FindingKind[] {
  return kinds.filter((k) => dimensionOfFinding(k) !== dimension);
}
