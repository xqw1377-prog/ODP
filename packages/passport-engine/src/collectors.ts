import type {
  CodeDim,
  Evidence,
  OnchainDim,
  PassportDims,
  ProductDim,
  SocialDim,
  TeamDim,
  TokenDim,
} from "@odp/domain";
import type { EvidenceBundle, FindingKind, Observation } from "./evidence.js";

/**
 * Six dimension collectors (P0-2). Each consumes raw observations for its
 * dimension and produces dimension facts (status + evidence + warnings +
 * unknowns). Collectors never decide the overall ruling — that belongs
 * exclusively to derivePassportRuling via buildPassport/reassessPassport.
 *
 * P0 collectors are fixture-driven; future real data sources (X API,
 * GitHub, Solana RPC, AI analysis) replace collector internals only —
 * the Passport Contract stays untouched.
 */

// ── shared helpers ─────────────────────────────────────────────────────

/** Provenance is preserved verbatim; machine findings are stripped. */
function toEvidence(observations: Observation[]): Evidence[] {
  return observations.map((o) => ({ source: o.source, detail: o.detail, url: o.url, at: o.at }));
}

function assertFindingsOwned(dimension: string, observations: Observation[], allowed: readonly FindingKind[]): void {
  const owned = new Set<string>(allowed);
  for (const o of observations) {
    for (const f of o.findings) {
      if (!owned.has(f)) {
        throw new Error(`${dimension} collector does not accept finding ${f}`);
      }
    }
  }
}

function hasFinding(observations: Observation[], finding: FindingKind): boolean {
  return observations.some((o) => o.findings.includes(finding));
}

/** Warnings in canonical order: observation order, then finding order, deduped. */
function collectWarnings(observations: Observation[], warningOf: Partial<Record<FindingKind, string>>): string[] {
  const out: string[] = [];
  for (const o of observations) {
    for (const f of o.findings) {
      const w = warningOf[f];
      if (w !== undefined && !out.includes(w)) out.push(w);
    }
  }
  return out;
}

// ── TEAM ───────────────────────────────────────────────────────────────

const TEAM_FINDINGS = [
  "FOUNDERS_PUBLIC",
  "PRIOR_SHIPPED",
  "PARTIAL_IDENTITY",
  "UNKNOWN_OPERATORS",
  "ADVERSE_HISTORY",
  "PRIOR_FRAUD",
] as const satisfies readonly FindingKind[];

export function collectTeam(observations: Observation[], updated_at: string): TeamDim {
  assertFindingsOwned("TEAM", observations, TEAM_FINDINGS);
  let status: TeamDim["status"];
  if (hasFinding(observations, "PRIOR_FRAUD")) status = "MALICIOUS";
  else if (hasFinding(observations, "FOUNDERS_PUBLIC") && hasFinding(observations, "PRIOR_SHIPPED")) status = "VERIFIED";
  else if (hasFinding(observations, "PARTIAL_IDENTITY")) status = "PARTIAL";
  else if (hasFinding(observations, "ADVERSE_HISTORY")) status = "CAUTION";
  else status = "UNVERIFIED";

  const unknowns: string[] = [];
  if (observations.length === 0) unknowns.push("no team evidence collected");
  else if (hasFinding(observations, "PARTIAL_IDENTITY")) unknowns.push("some contributors not publicly identified");
  else if (hasFinding(observations, "UNKNOWN_OPERATORS")) unknowns.push("operator identity unknown");

  return { status, evidence: toEvidence(observations), warnings: [], unknowns, updated_at };
}

// ── PRODUCT ────────────────────────────────────────────────────────────

const PRODUCT_FINDINGS = [
  "LANDING_PAGE_ONLY",
  "REVENUE_EVIDENCE",
  "LIVE_MAINNET",
  "TESTNET_WORKING",
  "DEMO_AVAILABLE",
  "WHITEPAPER_ONLY",
] as const satisfies readonly FindingKind[];

export function collectProduct(observations: Observation[], updated_at: string): ProductDim {
  assertFindingsOwned("PRODUCT", observations, PRODUCT_FINDINGS);
  let status: ProductDim["status"];
  if (hasFinding(observations, "LANDING_PAGE_ONLY")) status = "MISSING";
  else if (hasFinding(observations, "REVENUE_EVIDENCE")) status = "REVENUE";
  else if (hasFinding(observations, "LIVE_MAINNET")) status = "LIVE";
  else if (hasFinding(observations, "TESTNET_WORKING")) status = "TESTNET";
  else if (hasFinding(observations, "DEMO_AVAILABLE")) status = "DEMO";
  else status = "IDEA";

  const unknowns: string[] = [];
  if (observations.length === 0) unknowns.push("no product evidence collected");

  return { status, evidence: toEvidence(observations), warnings: [], unknowns, updated_at };
}

// ── CODE ───────────────────────────────────────────────────────────────

const CODE_FINDINGS = [
  "THIRD_PARTY_AUDIT",
  "STALE_REPO",
  "ACTIVE_DEVELOPMENT",
  "NO_PUBLIC_CODE",
  "SOURCE_UNVERIFIED",
] as const satisfies readonly FindingKind[];

export function collectCode(observations: Observation[], updated_at: string): CodeDim {
  assertFindingsOwned("CODE", observations, CODE_FINDINGS);
  let status: CodeDim["status"];
  if (hasFinding(observations, "THIRD_PARTY_AUDIT")) status = "AUDITED";
  else if (hasFinding(observations, "STALE_REPO")) status = "STALE";
  else if (hasFinding(observations, "ACTIVE_DEVELOPMENT")) status = "ACTIVE";
  else if (hasFinding(observations, "NO_PUBLIC_CODE")) status = "NONE";
  else if (hasFinding(observations, "SOURCE_UNVERIFIED")) status = "UNVERIFIED";
  else status = "NONE";

  const unknowns: string[] = [];
  if (observations.length === 0) unknowns.push("no code evidence collected");
  else if (hasFinding(observations, "SOURCE_UNVERIFIED")) unknowns.push("code source unverified (mirror or secondary source)");

  return { status, evidence: toEvidence(observations), warnings: [], unknowns, updated_at };
}

// ── TOKEN ──────────────────────────────────────────────────────────────

const TOKEN_FINDINGS = [
  "HONEYPOT_PATTERN",
  "MINT_AUTHORITY_RETAINED",
  "FREEZE_AUTHORITY_ACTIVE",
  "INSIDER_CONCENTRATION",
  "LIVE_TOKEN_PRE_PRODUCT",
  "MINT_AUTHORITY_REVOKED",
  "FREEZE_AUTHORITY_REVOKED",
  "LP_LOCKED",
  "NO_TRANSFER_TAX",
] as const satisfies readonly FindingKind[];

const TOKEN_WARNINGS: Partial<Record<FindingKind, string>> = {
  MINT_AUTHORITY_RETAINED: "mint authority retained by deployer",
  FREEZE_AUTHORITY_ACTIVE: "freeze authority active on token",
  INSIDER_CONCENTRATION: "insider supply concentration above threshold",
};

export function collectToken(observations: Observation[], updated_at: string): TokenDim {
  assertFindingsOwned("TOKEN", observations, TOKEN_FINDINGS);
  const hasCaution = (["MINT_AUTHORITY_RETAINED", "FREEZE_AUTHORITY_ACTIVE", "INSIDER_CONCENTRATION", "LIVE_TOKEN_PRE_PRODUCT"] as const).some(
    (f) => hasFinding(observations, f),
  );
  const hasHealthy = (["MINT_AUTHORITY_REVOKED", "FREEZE_AUTHORITY_REVOKED", "LP_LOCKED", "NO_TRANSFER_TAX"] as const).some(
    (f) => hasFinding(observations, f),
  );

  let status: TokenDim["status"];
  let unknowns: string[] = [];
  if (hasFinding(observations, "HONEYPOT_PATTERN")) status = "MALICIOUS";
  else if (hasCaution) status = "CAUTION";
  else if (hasHealthy) status = "HEALTHY";
  else {
    status = "CAUTION";
    unknowns = ["no token evidence collected"];
  }

  return {
    status,
    evidence: toEvidence(observations),
    warnings: collectWarnings(observations, TOKEN_WARNINGS),
    unknowns,
    updated_at,
  };
}

// ── ONCHAIN ────────────────────────────────────────────────────────────

const ONCHAIN_FINDINGS = [
  "WASH_TRADING_LOOP",
  "ABNORMAL_TREASURY_MOVE",
  "TREASURY_MATCHES_SCHEDULE",
  "NO_ABNORMAL_FLOWS",
] as const satisfies readonly FindingKind[];

export function collectOnchain(observations: Observation[], updated_at: string): OnchainDim {
  assertFindingsOwned("ONCHAIN", observations, ONCHAIN_FINDINGS);
  let status: OnchainDim["status"];
  let unknowns: string[] = [];
  if (hasFinding(observations, "WASH_TRADING_LOOP")) status = "MALICIOUS";
  else if (hasFinding(observations, "ABNORMAL_TREASURY_MOVE")) status = "ABNORMAL";
  else if (hasFinding(observations, "TREASURY_MATCHES_SCHEDULE") || hasFinding(observations, "NO_ABNORMAL_FLOWS")) status = "HEALTHY";
  else {
    status = "WATCH";
    unknowns = ["no on-chain evidence collected"];
  }

  return {
    status,
    evidence: toEvidence(observations),
    warnings: collectWarnings(observations, { ABNORMAL_TREASURY_MOVE: "abnormal treasury movement observed" }),
    unknowns,
    updated_at,
  };
}

// ── SOCIAL ─────────────────────────────────────────────────────────────

const SOCIAL_FINDINGS = [
  "BOT_DOMINANCE",
  "PAID_KOL_THREADS",
  "GROWTH_SPIKE_PAID",
  "ORGANIC_GROWTH",
  "LOW_BOT_RATIO",
] as const satisfies readonly FindingKind[];

export function collectSocial(observations: Observation[], updated_at: string): SocialDim {
  assertFindingsOwned("SOCIAL", observations, SOCIAL_FINDINGS);
  let status: SocialDim["status"];
  let unknowns: string[] = [];
  if (hasFinding(observations, "BOT_DOMINANCE")) status = "FAKE";
  else if (hasFinding(observations, "PAID_KOL_THREADS") || hasFinding(observations, "GROWTH_SPIKE_PAID")) status = "MIXED";
  else if (hasFinding(observations, "ORGANIC_GROWTH") || hasFinding(observations, "LOW_BOT_RATIO")) status = "ORGANIC";
  else {
    status = "MIXED";
    unknowns = ["no social evidence collected"];
  }

  return { status, evidence: toEvidence(observations), warnings: [], unknowns, updated_at };
}

// ── assembly ───────────────────────────────────────────────────────────

/** Assemble the six dimensions from a raw evidence bundle. */
export function assembleDims(bundle: EvidenceBundle): PassportDims {
  const at = bundle.collected_at;
  const o = bundle.observations;
  return {
    TEAM: collectTeam(o.TEAM, at),
    PRODUCT: collectProduct(o.PRODUCT, at),
    CODE: collectCode(o.CODE, at),
    TOKEN: collectToken(o.TOKEN, at),
    ONCHAIN: collectOnchain(o.ONCHAIN, at),
    SOCIAL: collectSocial(o.SOCIAL, at),
  };
}
