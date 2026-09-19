import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HumanProfileSchema } from "@odp/domain";
import type { HumanProfile } from "@odp/domain";
import { PassportEngine, ValidatedJsonStore } from "@odp/passport-engine";
import { loadHumanProfiles, loadMatchIntent, ProjectMatchIntentSchema } from "@odp/matching-engine";
import type { ProjectMatchIntent } from "@odp/matching-engine";
import type { HumanConsentRecord, HumanIntakeResult } from "./human-intake.js";
import { HumanConsentRecordSchema } from "./human-intake.js";
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

export function persistHumanIntake(result: HumanIntakeResult, dataDir = getPilotDataDir()): HumanProfile {
  const humans = humanStore(dataDir);
  const consents = consentStore(dataDir);

  for (const existing of humans.list()) {
    if (existing.wallet === result.profile.wallet && existing.human_id !== result.profile.human_id) {
      throw new Error(
        `wallet ${result.profile.wallet} is already bound to ${existing.human_id} — wallets must be unique`,
      );
    }
  }

  humans.save(result.profile);
  consents.save(result.consent);
  return result.profile;
}

export function loadOptInHumans(dataDir = getPilotDataDir()): HumanProfile[] {
  const consents = new Map(consentStore(dataDir).list().map((c) => [c.human_id, c]));
  const profiles = loadHumanProfiles(humansDir(dataDir));
  const opted: HumanProfile[] = [];
  for (const profile of profiles) {
    const consent = consents.get(profile.human_id);
    if (consent === undefined || consent.opted_in !== true) {
      throw new Error(`human ${profile.human_id} has no opt-in consent record — refuse to load into matching`);
    }
    opted.push(profile);
  }
  return opted;
}
