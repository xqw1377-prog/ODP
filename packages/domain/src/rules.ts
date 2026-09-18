import type { PassportDims, PassportStatus, ProjectPassport } from "./passport.js";
import { ProjectPassportSchema } from "./passport.js";
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

export interface AggregateResult {
  status: PassportStatus;
  reasons: string[];
}

/**
 * Deterministic aggregation of the six dimensions into ALLOW / WATCH / REJECT.
 * Rules (short-circuit in order):
 *   1. FATAL — TEAM/TOKEN/ONCHAIN=MALICIOUS or SOCIAL=FAKE      → REJECT
 *   2. WARN  — any dimension carries warnings (P0 conservative) → WATCH
 *   3. SHORT — below the ALLOW baseline                         → WATCH
 *   4. otherwise                                                → ALLOW
 * Unknowns are displayed but never decide the ruling.
 */
export function aggregatePassportStatus(dims: PassportDims): AggregateResult {
  const reasons: string[] = [];

  // 1. FATAL
  for (const [dim, fatalStatus] of Object.entries(FATAL) as [keyof PassportDims, string][]) {
    if (dims[dim].status === fatalStatus) {
      reasons.push(`${dim}=${dims[dim].status} is a fatal signal`);
    }
  }
  if (reasons.length > 0) return { status: "REJECT", reasons };

  // 2. WARN
  for (const dim of Object.keys(dims) as (keyof PassportDims)[]) {
    if (dims[dim].warnings.length > 0) {
      reasons.push(`${dim} carries ${dims[dim].warnings.length} warning(s)`);
    }
  }
  if (reasons.length > 0) return { status: "WATCH", reasons };

  // 3. ALLOW baseline shortfalls
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

  // 4. ALLOW
  return { status: "ALLOW", reasons: ["all six dimensions meet the ALLOW baseline"] };
}

/**
 * Build the initial passport from a candidate's dimension evidence.
 * The first history entry records the DISCOVERED → ruling transition.
 */
export function buildPassport(project_id: string, dims: PassportDims, at = nowIso()): ProjectPassport {
  const { status, reasons } = aggregatePassportStatus(dims);
  const passport: ProjectPassport = {
    project_id,
    dims,
    status,
    reasons,
    status_history: [{ from: "DISCOVERED", to: status, reason: `initial ruling: ${reasons.join("; ")}`, at }],
    updated_at: at,
  };
  return ProjectPassportSchema.parse(passport);
}

/**
 * Continuous-audit transition. Rules:
 *   - REJECT is terminal in P0.
 *   - Same-state transition is a no-op (no history entry).
 *   - Every real change appends {from, to, reason, at} to status_history.
 */
export function transitionPassport(
  p: ProjectPassport,
  to: PassportStatus,
  reason: string,
  at = nowIso(),
): ProjectPassport {
  if (p.status === "REJECT" && to !== "REJECT") {
    throw new Error(`REJECT is terminal in ODP P0: cannot transition ${p.project_id} REJECT → ${to}`);
  }
  if (p.status === to) return p;
  const next: ProjectPassport = {
    ...p,
    status: to,
    reasons: [reason],
    status_history: [...p.status_history, { from: p.status, to, reason, at }],
    updated_at: at,
  };
  return ProjectPassportSchema.parse(next);
}
