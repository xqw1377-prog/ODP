import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FixtureDiscoverySource,
  loadEvidenceBundles,
  generatePassport,
} from "@odp/passport-engine";
import { loadMatchIntent, loadHumanProfiles, matchProject } from "../src/index.js";

/**
 * G3 fixed demo case: Aurora Net (ALLOW) × 3 human fixtures.
 * Prints the deterministic ranking with "Why you were selected" reasons.
 */
const ownDir = path.dirname(fileURLToPath(import.meta.url));
// monorepo-internal dev path: reuse the passport-engine golden fixtures
const engineFixtures = path.resolve(ownDir, "../../passport-engine/fixtures");
const ownFixtures = path.resolve(ownDir, "../fixtures");

const candidates = new FixtureDiscoverySource(path.join(engineFixtures, "discovery")).discover();
const bundles = loadEvidenceBundles(path.join(engineFixtures, "evidence"));
const aurora = candidates.find((c) => c.project_id === "prj_aurora_net");
if (aurora === undefined) throw new Error("aurora candidate fixture missing");
const bundle = bundles.find((b) => b.project_id === "prj_aurora_net");
if (bundle === undefined) throw new Error("aurora evidence fixture missing");

const passport = generatePassport(aurora, bundle);
const intent = loadMatchIntent(path.join(ownFixtures, "intents", "prj_aurora_net.intent.json"));
const humans = loadHumanProfiles(path.join(ownFixtures, "humans"));

const ranked = matchProject({ passport, intent, humans });

console.log(`Project: ${aurora.name} (${passport.project_id}) — Passport status: ${passport.status}`);
console.log(`Intent target tags: ${intent.target_tags.join(", ")}`);
console.log("");
ranked.forEach((r, i) => {
  console.log(`#${i + 1} ${r.human_id} — match_score ${r.match_score}`);
  for (const reason of r.match_reasons) console.log(`    - ${reason}`);
});
