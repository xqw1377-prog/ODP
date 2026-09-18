import { HumanProfileSchema, MatchResultSchema } from "@odp/domain";
import type { HumanProfile, MatchResult, ProjectPassport, RiskFlag } from "@odp/domain";
import { ProjectMatchIntentSchema } from "./intent.js";
import type { ProjectMatchIntent } from "./intent.js";

/**
 * Deterministic, explainable matching (P0-3).
 *
 * Formula (fixed; no follower count, no wealth, no token balance, no payment):
 *   match_score = 0.55 × interestFit + 0.20 × human_confidence
 *               + 0.15 × reputation     + 0.10 × network_score
 * where interestFit = |human.interest_tags ∩ intent.target_tags| / |target_tags|.
 */
export const MATCH_WEIGHTS = {
  interestFit: 0.55,
  humanConfidence: 0.2,
  reputation: 0.15,
  networkQuality: 0.1,
} as const;

/**
 * Risk gate: every declared risk flag blocks matching in P0 ("…等明确风险
 * 旗标"). A blocked human scores exactly 0 with explicit reasons — no amount
 * of confidence, reputation or network score can outbid risk.
 */
const BLOCKING_RISK_FLAGS: readonly RiskFlag[] = [
  "SYBIL",
  "BOT",
  "FARMING",
  "MANIPULATION",
  "FAKE_ENGAGEMENT",
  "WALLET_CLUSTER",
];

export interface MatchRequest {
  passport: ProjectPassport;
  intent: ProjectMatchIntent;
  humans: HumanProfile[];
}

/** Matched tags in target-tag order (deterministic). */
export function interestOverlap(targetTags: readonly string[], humanTags: readonly string[]): string[] {
  const owned = new Set(humanTags);
  return targetTags.filter((t) => owned.has(t));
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function band(value: number, labels: readonly [string, string, string], thresholds: readonly [number, number]): string {
  return value >= thresholds[0] ? labels[0] : value >= thresholds[1] ? labels[1] : labels[2];
}

function matchOne(project_id: string, intent: ProjectMatchIntent, human: HumanProfile): MatchResult {
  const blocked = BLOCKING_RISK_FLAGS.filter((f) => human.risk_flags.includes(f));
  if (blocked.length > 0) {
    return MatchResultSchema.parse({
      project_id,
      human_id: human.human_id,
      match_score: 0,
      match_reasons: blocked.map((f) => `blocked: ${f} risk`),
    });
  }

  const matched = interestOverlap(intent.target_tags, human.interest_tags);
  const fit = matched.length / intent.target_tags.length;
  const score = round4(
    MATCH_WEIGHTS.interestFit * fit +
      MATCH_WEIGHTS.humanConfidence * human.human_confidence +
      MATCH_WEIGHTS.reputation * human.reputation +
      MATCH_WEIGHTS.networkQuality * human.network_score,
  );

  const reasons: string[] = [
    matched.length === intent.target_tags.length
      ? `Strong interest fit: ${matched.join(" / ")}`
      : matched.length > 0
        ? `Partial interest fit: ${matched.join(" / ")} (${matched.length} of ${intent.target_tags.length} target interests)`
        : `No interest overlap with project targets (${intent.target_tags.length} target interests)`,
    band(human.human_confidence, ["High human confidence", "Moderate human confidence", "Low human confidence"], [0.8, 0.5]),
    band(human.reputation, ["Strong reputation", "Moderate reputation", "Limited reputation history"], [0.8, 0.5]),
    band(human.network_score, ["Healthy network contribution", "Some network contribution", "Minimal network contribution"], [0.7, 0.4]),
  ];
  if (human.interest_tags.includes("developer") && fit < 0.5) {
    reasons.push("Developer background noted, but current project target fit is limited");
  }

  return MatchResultSchema.parse({ project_id, human_id: human.human_id, match_score: score, match_reasons: reasons });
}

/**
 * The only matching entry point. Hard gates (fail closed):
 *   1. Identity binding: intent.project_id must equal passport.project_id.
 *   2. Trust gate: passport.status must be ALLOW (WATCH / REJECT → MATCH DENIED).
 *   3. Input humans are schema-validated; duplicate human_ids rejected.
 *
 * Output is deterministic: same inputs → same scores, same reasons, same
 * ranking. Ties resolve by human_id ASC. No randomness anywhere.
 */
export function matchProject({ passport, intent, humans }: MatchRequest): MatchResult[] {
  const validatedIntent = ProjectMatchIntentSchema.parse(intent);
  if (validatedIntent.project_id !== passport.project_id) {
    throw new Error(
      `MATCH DENIED: intent project ${validatedIntent.project_id} does not bind to passport ${passport.project_id} (identity binding)`,
    );
  }
  if (passport.status !== "ALLOW") {
    throw new Error(`MATCH DENIED: project ${passport.project_id} is ${passport.status} — trust gate requires ALLOW`);
  }

  const seen = new Set<string>();
  for (const h of humans) {
    const v = HumanProfileSchema.parse(h);
    if (seen.has(v.human_id)) {
      throw new Error(`duplicate human_id in matching input: ${v.human_id}`);
    }
    seen.add(v.human_id);
  }

  return humans
    .map((h) => matchOne(passport.project_id, validatedIntent, h))
    .sort(
      (a, b) =>
        b.match_score - a.match_score || (a.human_id < b.human_id ? -1 : a.human_id > b.human_id ? 1 : 0),
    );
}
