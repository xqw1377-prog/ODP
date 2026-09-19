import { loadHumanProfiles } from "@odp/matching-engine";
import type { FunnelStage } from "./human-intake.js";
import {
  FUNNEL_STAGES,
  POOL_COMPOSITION_TARGET,
  POOL_SEED_TARGET,
  POOL_STRETCH_HOLD,
  SLOGAN,
  isEligibleConsent,
} from "./human-intake.js";
import { getPilotDataDir, humansDir } from "./paths.js";
import { listConsentRecords } from "./persist.js";

export interface EligibleHumanView {
  human_id: string;
  x_id: string;
  wallet: string;
  interest_tags: string[];
  funnel_stage: FunnelStage;
}

export interface PilotPoolSnapshot {
  slogan: string;
  eligible: number;
  target: number;
  stretch_hold: number;
  composition_target: typeof POOL_COMPOSITION_TARGET;
  stages: Record<FunnelStage, number>;
  review: Array<{ human_id: string; review_flags: string[] }>;
  humans: EligibleHumanView[];
}

export function readPilotPool(dataDir = getPilotDataDir()): PilotPoolSnapshot {
  const consents = new Map(listConsentRecords(dataDir).map((c) => [c.human_id, c]));
  const profiles = loadHumanProfiles(humansDir(dataDir));
  const stages = Object.fromEntries(FUNNEL_STAGES.map((s) => [s, 0])) as Record<FunnelStage, number>;
  const humans: EligibleHumanView[] = [];
  const review: Array<{ human_id: string; review_flags: string[] }> = [];

  for (const profile of profiles) {
    const consent = consents.get(profile.human_id);
    if (consent === undefined) {
      throw new Error(`human ${profile.human_id} has no opt-in consent record — refuse to count`);
    }
    stages[consent.funnel_stage] += 1;
    if (consent.review_flags.length > 0) {
      review.push({ human_id: profile.human_id, review_flags: [...consent.review_flags] });
    }
    if (isEligibleConsent(consent)) {
      humans.push({
        human_id: profile.human_id,
        x_id: profile.x_id,
        wallet: profile.wallet,
        interest_tags: profile.interest_tags,
        funnel_stage: consent.funnel_stage,
      });
    }
  }

  return {
    slogan: SLOGAN,
    eligible: humans.length,
    target: POOL_SEED_TARGET,
    stretch_hold: POOL_STRETCH_HOLD,
    composition_target: POOL_COMPOSITION_TARGET,
    stages,
    review,
    humans,
  };
}

export function formatPoolDump(pool: PilotPoolSnapshot): string {
  const c = pool.composition_target;
  return [
    `ODP Early Humans — ${pool.slogan}`,
    `ELIGIBLE: ${pool.eligible} / ${pool.target} seed  (${pool.stretch_hold} stretch HOLD)`,
    `composition target: ${c.builders} builders / ${c.depin_node} DePIN-node / ${c.infra} infra / ${c.early_adopters} early adopters / ${c.founders} founders`,
    `review: ${pool.review.length}`,
    ...pool.humans.map((h) => `${h.human_id}\t${h.x_id}\t${h.interest_tags.join(",")}`),
    "",
  ].join("\n");
}
