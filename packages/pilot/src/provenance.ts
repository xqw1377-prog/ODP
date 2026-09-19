import { z } from "zod";

/* D2-R: provenance explains WHY a number exists — never the other way around.
   The frozen matcher consumes only `value` (0..1); everything else here is the
   audit trail that keeps us honest about what real evidence exists.
     human_confidence = how sure we are this is a real, correctly-bound person
     reputation       = trusted past contributions (0 until public evidence)
     network_score    = verifiable participation quality (0 until computed)   */

export const ScoreSourceSchema = z.enum([
  "NONE",
  "SELF_DECLARED",
  "WALLET_VERIFIED",
  "X_VERIFIED",
  "PUBLIC_SIGNAL",
  "MANUAL_REVIEW",
  "DERIVED",
]);
export type ScoreSource = z.infer<typeof ScoreSourceSchema>;

export const ScoreProvenanceSchema = z.strictObject({
  value: z.number().min(0).max(1),
  source: ScoreSourceSchema,
  evidence: z.string().min(1),
  computed_at: z.string(),
});
export type ScoreProvenance = z.infer<typeof ScoreProvenanceSchema>;

export const WALLET_VERIFIED_BONUS = 0.4;
export const X_SELF_DECLARED_BONUS = 0.1;
export const X_VERIFIED_BONUS = 0.4;

export function noEvidenceScore(kind: "reputation" | "network_score", computed_at: string): ScoreProvenance {
  return {
    value: 0,
    source: "NONE",
    evidence:
      kind === "reputation"
        ? "no public contribution evidence yet — honest zero, rises only with verifiable contributions"
        : "no verifiable network behavior yet — honest zero, rises only with computed evidence",
    computed_at,
  };
}

export function computeHumanConfidence(
  input: { wallet_verified: boolean; x_identity_status: "NONE" | "SELF_DECLARED" | "X_VERIFIED" },
  computed_at: string,
): ScoreProvenance {
  let value = 0;
  const parts: string[] = [];
  if (input.wallet_verified) {
    value += WALLET_VERIFIED_BONUS;
    parts.push("wallet ownership proven by signed enrollment challenge (+0.4)");
  }
  if (input.x_identity_status === "SELF_DECLARED") {
    value += X_SELF_DECLARED_BONUS;
    parts.push("X handle self-declared, unverified (+0.1)");
  }
  if (input.x_identity_status === "X_VERIFIED") {
    value += X_VERIFIED_BONUS;
    parts.push("X identity verified via OAuth (+0.4)");
  }
  return {
    value: Math.min(1, value),
    source: "DERIVED",
    evidence: parts.length > 0 ? parts.join("; ") : "no identity evidence at all",
    computed_at,
  };
}
