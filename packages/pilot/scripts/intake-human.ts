import { readFileSync } from "node:fs";
import { intakeHuman } from "../src/human-intake.js";
import { persistHumanIntake } from "../src/persist.js";
import { getPilotDataDir } from "../src/paths.js";
import { flag, requireFlag } from "../src/cli.js";

/**
 * CLI: Early Humans V0 intake → HumanProfile + consent sidecar.
 *   npm run pilot:intake-human -- --file packages/pilot/fixtures/humans/hum_pilot_ada.intake.json
 */
const file = requireFlag("--file");
const dataDir = getPilotDataDir(flag("--data-dir"));
const result = intakeHuman(JSON.parse(readFileSync(file, "utf8")));
persistHumanIntake(result, dataDir);

console.log(`human_id: ${result.profile.human_id}`);
console.log(`x_id:     ${result.profile.x_id} (stub, unverified)`);
console.log(`wallet:   ${result.profile.wallet}`);
console.log(`tags:     ${result.profile.interest_tags.join(", ")}`);
console.log(`consent:  opted in at ${result.consent.opted_in_at}`);
console.log(`data_dir: ${dataDir}`);
