import { intakeProjectFromFile } from "../src/project-intake.js";
import { persistProjectIntake } from "../src/persist.js";
import { getPilotDataDir } from "../src/paths.js";
import { flag, requireFlag } from "../src/cli.js";

/**
 * CLI: real project brief → Passport pipeline + MatchIntent (existing engines).
 *   npm run pilot:intake-project -- --brief packages/pilot/fixtures/briefs/helios.brief.json
 */
const brief = requireFlag("--brief");
const dataDir = getPilotDataDir(flag("--data-dir"));
const result = intakeProjectFromFile(brief);
persistProjectIntake(result, dataDir);

console.log(`project_id: ${result.candidate.project_id}`);
console.log(`name:       ${result.candidate.name}`);
console.log(`passport:   ${result.passport.status} (derived by passport-engine, not declared)`);
console.log(`reasons:    ${result.passport.reasons.join(" | ")}`);
console.log(`intent:     ${result.intent.target_tags.join(", ")}`);
console.log(`data_dir:   ${dataDir}`);
if (result.passport.status !== "ALLOW") {
  console.log("note: matching requires ALLOW — add evidence findings; the adapter will not invent them.");
}
