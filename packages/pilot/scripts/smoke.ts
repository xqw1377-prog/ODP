import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FixtureDiscoverySource,
  loadEvidenceBundles,
  generatePassport,
} from "@odp/passport-engine";
import { loadHumanProfiles, loadMatchIntent, matchProject } from "@odp/matching-engine";
import { intakeHuman } from "../src/human-intake.js";
import { persistHumanIntake } from "../src/persist.js";
import { runPilot } from "../src/runner.js";
import { PILOT_FIXTURES, REPO_ROOT } from "../src/paths.js";

/**
 * Smoke: (a) non-Aurora Helios matches synthetic opt-in humans
 *        (b) Aurora fixture path still ranks Maya > Dan > Sib
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
}

const dataDir = mkdtempSync(path.join(tmpdir(), "odp-pilot-smoke-"));
for (const name of ["hum_pilot_ada", "hum_pilot_ben", "hum_pilot_cy"]) {
  persistHumanIntake(
    intakeHuman(JSON.parse(readFileSync(path.join(PILOT_FIXTURES, "humans", `${name}.intake.json`), "utf8"))),
    dataDir,
  );
}

const helios = runPilot({
  dataDir,
  briefFile: path.join(PILOT_FIXTURES, "briefs", "helios.brief.json"),
});

assert(helios.inputs.project_id === "prj_helios_mesh", "expected Helios, not Aurora");
assert(helios.inputs.project_id !== "prj_aurora_net", "pilot path must not hard-bind Aurora");
assert(helios.passport.status === "ALLOW", "Helios fixture evidence should derive ALLOW");
assert(
  helios.inputs.matches.some((m) => m.match_score > 0 && m.human_id.startsWith("hum_pilot_")),
  "at least one synthetic opt-in human must match",
);
assert(!helios.inputs.humans.some((h) => h.human_id === "hum_maya"), "pilot humans must not be Maya/Dan fixtures");
console.log(`(a) PASS  ${helios.inputs.project_id} matched ${helios.inputs.matches.map((m) => `${m.human_id}:${m.match_score}`).join(" ")}`);

const passportFixtures = path.join(REPO_ROOT, "packages/passport-engine/fixtures");
const matchingFixtures = path.join(REPO_ROOT, "packages/matching-engine/fixtures");
const candidates = new FixtureDiscoverySource(path.join(passportFixtures, "discovery")).discover();
const bundles = loadEvidenceBundles(path.join(passportFixtures, "evidence"));
const aurora = candidates.find((c) => c.project_id === "prj_aurora_net");
const bundle = bundles.find((b) => b.project_id === "prj_aurora_net");
assert(aurora && bundle, "aurora fixtures missing");
const passport = generatePassport(aurora, bundle);
const intent = loadMatchIntent(path.join(matchingFixtures, "intents", "prj_aurora_net.intent.json"));
const humans = loadHumanProfiles(path.join(matchingFixtures, "humans"));
const matches = matchProject({ passport, intent, humans });
assert(matches.map((m) => m.human_id).join(",") === "hum_maya,hum_dev_dan,hum_sib", "aurora ranking drifted");
assert(matches[0]!.match_score > matches[1]!.match_score, "maya must outrank dan");
assert(matches[2]!.match_score === 0, "sib must remain risk-blocked");
console.log(`(b) PASS  Aurora still ${passport.status}  Maya ${matches[0]!.match_score} > Dan ${matches[1]!.match_score} > Sib 0`);

console.log("PILOT SMOKE PASS");
