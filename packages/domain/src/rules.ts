import { PassportDimsSchema, ProjectPassportSchema } from "./passport.js";
import type { PassportDims, PassportStatus, ProjectPassport } from "./passport.js";
import { nowIso } from "./util.js";

// ── Dimension rankings (higher = stronger evidence) ────────────────────

const TEAM_RANK: Record<PassportDims["TEAM"]["status"], number> = {
  VERIFIED: 4,
  PARTIAL: 3,
  CAUTION: 2,
  UNVERIFIED: 1,
  MALICIOUS: 0,
};

const PRODUCT_RANK: Record<PassportDims["PRODUCT"]["status"], number> = {
  MISSING: -1,
  IDEA: 0,
  DEMO: 1,
  TESTNET: 2,
  LIVE: 3,
  REVENUE: 4,
};

/** Fatal signals — any one of these rules the project REJECT. */
const FATAL: Partial<Record<keyof PassportDims, string>> = {
  TEAM: "MALICIOUS",
  TOKEN: "MALICIOUS",
  ONCHAIN: "MALICIOUS",
  SOCIAL: "FAKE",
};

const DIMENSION_ORDER = ["TEAM", "PRODUCT", "CODE", "TOKEN", "ONCHAIN", "SOCIAL"] as const;

export interface AggregateResult {
  status: PassportStatus;
  reasons: string[];
}

/**
 * Deterministic aggregation of the six dimensions into ALLOW / WATCH / REJECT.
 * Rules (short-circuit in order):
 *   1. FATAL       — TEAM/TOKEN/ONCHAIN=MALICIOUS or SOCIAL=FAKE → REJECT
 *   2. WARN        — any dimension carries warnings (P0 conservative) → WATCH
 *   3. SHORT       — below the ALLOW baseline                        → WATCH
 *   4. NO_EVIDENCE — any dimension has evidence=[] (Trust must be
 *                    evidence-based; a bare status claim is worthless) → WATCH
 *   5. otherwise                                                    → ALLOW
 * Unknowns are displayed but never decide the ruling.
 */
export function aggregatePassportStatus(dims: PassportDims): AggregateResult {
  const reasons: string[] = [];

  // 1. FATAL → REJECT
  for (const dim of DIMENSION_ORDER) {
    if (FATAL[dim] !== undefined && dims[dim].status === FATAL[dim]) {
      reasons.push(`${dim}=${dims[dim].status} is a fatal signal`);
    }
  }
  if (reasons.length > 0) return { status: "REJECT", reasons };

  // 2. WARN → WATCH
  for (const dim of DIMENSION_ORDER) {
    if (dims[dim].warnings.length > 0) {
      reasons.push(`${dim} carries ${dims[dim].warnings.length} warning(s)`);
    }
  }
  if (reasons.length > 0) return { status: "WATCH", reasons };

  // 3. ALLOW baseline shortfalls → WATCH
  if (TEAM_RANK[dims.TEAM.status] < TEAM_RANK.PARTIAL) {
    reasons.push(`TEAM=${dims.TEAM.status} is below the required PARTIAL`);
  }
  if (PRODUCT_RANK[dims.PRODUCT.status] < PRODUCT_RANK.TESTNET) {
    reasons.push(`PRODUCT=${dims.PRODUCT.status} is below the required TESTNET`);
  }
  if (dims.CODE.status !== "ACTIVE" && dims.CODE.status !== "AUDITED") {
    reasons.push(`CODE=${dims.CODE.status} is below the required ACTIVE`);
  }
  if (dims.TOKEN.status !== "HEALTHY") {
    reasons.push(`TOKEN=${dims.TOKEN.status} is not HEALTHY`);
  }
  if (dims.ONCHAIN.status !== "HEALTHY") {
    reasons.push(`ONCHAIN=${dims.ONCHAIN.status} is not HEALTHY`);
  }
  if (dims.SOCIAL.status !== "ORGANIC") {
    reasons.push(`SOCIAL=${dims.SOCIAL.status} is not ORGANIC`);
  }
  if (reasons.length > 0) return { status: "WATCH", reasons };

  // 4. NO_EVIDENCE → WATCH: a status without evidence cannot yield ALLOW
  for (const dim of DIMENSION_ORDER) {
    if (dims[dim].evidence.length === 0) {
      reasons.push(`NO_EVIDENCE: ${dim}`);
    }
  }
  if (reasons.length > 0) return { status: "WATCH", reasons };

  // 5. ALLOW
  return { status: "ALLOW", reasons: ["all six dimensions meet the ALLOW baseline"] };
}

/**
 * Build the initial passport from a candidate's dimension evidence.
 * The first history entry records the DISCOVERED → ruling transition.
 */
export function buildPassport(project_id: string, dims: PassportDims, at = nowIso()): ProjectPassport {
  const validated = PassportDimsSchema.parse(dims);
  const { status, reasons } = aggregatePassportStatus(validated);
  const passport: ProjectPassport = {
    project_id,
    dims: validated,
    status,
    reasons,
    status_history: [{ from: "DISCOVERED", to: status, reason: `initial ruling: ${reasons.join("; ")}`, at }],
    updated_at: at,
  };
  return ProjectPassportSchema.parse(passport);
}

/**
 * Continuous-audit re-ruling. ODP constitutional constraint:
 * **status is produced by evidence, never dictated by the caller.**
 *
 * There is deliberately no API that sets the overall status directly. The
 * next overall status is always `aggregatePassportStatus(nextDims)`; the
 * caller only supplies new evidence (and a human-readable trigger reason
 * recorded in history when the ruling actually changes).
 *
 * Consequences:
 *   - A persisted passport can never contradict its six dimensions.
 *   - Recovery (REJECT/WATCH → ALLOW) requires the evidence itself to heal —
 *     there is no appeal path around the dims in P0.
 *   - Re-assessment with an unchanged aggregate refreshes dims/updated_at
 *     but appends nothing to history.
 */
export function reassessPassport(
  previous: ProjectPassport,
  nextDims: PassportDims,
  reason: string,
  at = nowIso(),
): ProjectPassport {
  const dims = PassportDimsSchema.parse(nextDims);
  const { status, reasons } = aggregatePassportStatus(dims);
  const status_history =
    status === previous.status
      ? previous.status_history
      : [...previous.status_history, { from: previous.status, to: status, reason, at }];
  return ProjectPassportSchema.parse({
    ...previous,
    dims,
    status,
    reasons,
    status_history,
    updated_at: at,
  });
}
