import { AllocationSchema, assertAllocationConservation } from "@odp/domain";
import type { Allocation, Distribution, HumanProfile, MatchResult } from "@odp/domain";
import { DistributionSchema } from "@odp/domain";

/**
 * P0 allocation policy (frozen for the hackathon demo):
 *   eligibility = match_score > 0   (risk-blocked humans score exactly 0)
 *   selection   = top N by ranking
 *   amount      = EQUAL split of distribution.total_amount
 *
 * Invariant #3: match score is NOT token entitlement — Maya's higher score
 * does not buy her more tokens than Dan's. Matching decides WHO is
 * eligible; the policy decides HOW MUCH, and in P0 that is equal.
 */
export interface AllocationPolicy {
  topN: number;
}

export const P0_ALLOCATION_POLICY: AllocationPolicy = { topN: 2 };

export function buildAllocations(
  distribution: Distribution,
  rankedMatches: MatchResult[],
  humans: HumanProfile[],
  policy: AllocationPolicy = P0_ALLOCATION_POLICY,
): Allocation[] {
  const d = DistributionSchema.parse(distribution);
  if (!Number.isInteger(policy.topN) || policy.topN < 1) {
    throw new Error("allocation policy requires topN >= 1");
  }

  // Defensive re-ranking: score DESC, then human_id ASC (same as matcher).
  const ranked = [...rankedMatches].sort(
    (a, b) =>
      b.match_score - a.match_score || (a.human_id < b.human_id ? -1 : a.human_id > b.human_id ? 1 : 0),
  );

  const humansById = new Map(humans.map((h) => [h.human_id, h]));
  const selected = ranked.filter((m) => m.match_score > 0).slice(0, policy.topN);
  if (selected.length === 0) {
    throw new Error("no eligible humans (all match scores are 0) — nothing to allocate");
  }

  // Wallets must be unique within a distribution (Claim PDA anti-double-claim
  // relies on one leaf per wallet).
  const wallets = selected.map((m) => {
    const human = humansById.get(m.human_id);
    if (human === undefined) {
      throw new Error(`match result references unknown human ${m.human_id} (identity binding)`);
    }
    return human.wallet;
  });
  if (new Set(wallets).size !== wallets.length) {
    throw new Error("duplicate wallet in allocation set — wallets must be unique within a distribution");
  }

  const total = BigInt(d.total_amount);
  const perHuman = total / BigInt(selected.length);
  if (perHuman * BigInt(selected.length) !== total) {
    throw new Error(
      `equal split impossible: total ${d.total_amount} does not divide by ${selected.length} recipients (P0 policy requires exact division)`,
    );
  }
  const amount = perHuman.toString();

  const allocations = selected.map((m, i) =>
    AllocationSchema.parse({
      distribution_id: d.distribution_id,
      human_id: m.human_id,
      wallet: wallets[i]!,
      amount,
    }),
  );
  assertAllocationConservation(d.total_amount, allocations);
  return allocations;
}
