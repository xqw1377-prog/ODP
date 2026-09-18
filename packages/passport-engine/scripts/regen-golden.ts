import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FixtureDiscoverySource, loadEvidenceBundles, generatePassport } from "../src/index.js";

/**
 * Regenerate the golden expected passports (fixtures/expected/) from the
 * RAW inputs only: discovery candidates + evidence bundles. The pipeline is
 * fully deterministic (timestamps come from bundle.collected_at), so
 * re-running this script must be a no-op diff.
 */
const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));
const candidates = new FixtureDiscoverySource(path.join(fixturesDir, "discovery")).discover();
const byId = new Map(candidates.map((c) => [c.project_id, c]));
const bundles = loadEvidenceBundles(path.join(fixturesDir, "evidence"));

if (bundles.length === 0) {
  throw new Error("no evidence bundles found");
}

const outDir = path.join(fixturesDir, "expected");
mkdirSync(outDir, { recursive: true });

for (const bundle of bundles) {
  const candidate = byId.get(bundle.project_id);
  if (candidate === undefined) {
    throw new Error(`no candidate for evidence bundle ${bundle.project_id}`);
  }
  const passport = generatePassport(candidate, bundle);
  const file = path.join(outDir, `${bundle.project_id}.passport.json`);
  writeFileSync(file, JSON.stringify(passport, null, 2) + "\n", "utf8");
  console.log(`${bundle.project_id} -> ${passport.status} (${file})`);
}
