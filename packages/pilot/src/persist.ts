import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HumanProfileSchema } from "@odp/domain";
import type { HumanProfile } from "@odp/domain";
import { PassportEngine, ValidatedJsonStore } from "@odp/passport-engine";
import { loadHumanProfiles, loadMatchIntent, ProjectMatchIntentSchema } from "@odp/matching-engine";
import type { ProjectMatchIntent } from "@odp/matching-engine";
import type { HumanConsentRecord, HumanIntakeResult, ReviewFlag } from "./human-intake.js";
import { HumanConsentRecordSchema, isEligibleConsent } from "./human-intake.js";
import type { ProjectIntakeResult } from "./project-intake.js";
import { consentsDir, getPilotDataDir, humansDir, intentsDir } from "./paths.js";

export function openPassportEngine(dataDir = getPilotDataDir()): PassportEngine {
  return new PassportEngine({ dataDir });
}

export function persistProjectIntake(result: ProjectIntakeResult, dataDir = getPilotDataDir()): void {
  const engine = openPassportEngine(dataDir);
  engine.ingestCandidate(result.candidate);
  engine.generateFromBundle(result.candidate, result.evidence);
  mkdirSync(intentsDir(dataDir), { recursive: true });
  const parsed = ProjectMatchIntentSchema.parse(result.intent);
  writeFileSync(
    path.join(intentsDir(dataDir), `${parsed.project_id}.intent.json`),
    JSON.stringify(parsed, null, 2) + "\n",
    "utf8",
  );
}

export function loadPersistedIntent(projectId: string, dataDir = getPilotDataDir()): ProjectMatchIntent {
  return loadMatchIntent(path.join(intentsDir(dataDir), `${projectId}.intent.json`));
}

function humanStore(dataDir: string): ValidatedJsonStore<HumanProfile> {
  return new ValidatedJsonStore(humansDir(dataDir), HumanProfileSchema, (h) => h.human_id);
}

function consentStore(dataDir: string): ValidatedJsonStore<HumanConsentRecord> {
  return new ValidatedJsonStore(consentsDir(dataDir), HumanConsentRecordSchema, (c) => c.human_id);
}

export function listConsentRecords(dataDir = getPilotDataDir()): HumanConsentRecord[] {
  return consentStore(dataDir).list();
}

function reviewFlagsFor(profile: HumanProfile, others: HumanProfile[]): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (others.some((h) => h.wallet === profile.wallet && h.human_id !== profile.human_id)) {
    flags.push("MULTI_WALLET");
  }
  if (others.some((h) => h.x_id === profile.x_id && h.human_id !== profile.human_id)) {
    flags.push("MULTI_X");
  }
  return flags;
}

export function persistHumanIntake(result: HumanIntakeResult, dataDir = getPilotDataDir()): HumanIntakeResult {
  const humans = humanStore(dataDir);
  const consents = consentStore(dataDir);
  const flags = reviewFlagsFor(result.profile, humans.list());
  const consent = HumanConsentRecordSchema.parse({
    ...result.consent,
    review_flags: flags,
    funnel_stage: flags.length === 0 ? "ELIGIBLE_HUMAN" : "WALLET_BOUND",
  });

  humans.save(result.profile);
  consents.save(consent);
  return { profile: result.profile, consent };
}

/** Match pool = ELIGIBLE humans only (consent + complete + no review flags). */
export function loadOptInHumans(dataDir = getPilotDataDir()): HumanProfile[] {
  const consents = new Map(listConsentRecords(dataDir).map((c) => [c.human_id, c]));
  const opted: HumanProfile[] = [];
  for (const profile of loadHumanProfiles(humansDir(dataDir))) {
    const consent = consents.get(profile.human_id);
    if (consent === undefined) {
      throw new Error(`human ${profile.human_id} has no opt-in consent record — refuse to load into matching`);
    }
    if (isEligibleConsent(consent)) opted.push(profile);
  }
  return opted;
}
