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
const taken = persistHumanIntake(intakeHuman(JSON.parse(readFileSync(file, "utf8"))), dataDir);

console.log(`human_id: ${taken.profile.human_id}`);
console.log(`x_id:     ${taken.profile.x_id} (stub, unverified)`);
console.log(`wallet:   ${taken.profile.wallet}`);
console.log(`tags:     ${taken.profile.interest_tags.join(", ")}`);
console.log(`funnel:   ${taken.consent.funnel_stage}`);
console.log(`review:   ${taken.consent.review_flags.join(",") || "(none)"}`);
console.log(`data_dir: ${dataDir}`);
