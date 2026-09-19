import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { verifyMerkleProof, allocationLeaf } from "@odp/domain";
import {
  FixtureDiscoverySource,
  loadEvidenceBundles,
  generatePassport,
} from "@odp/passport-engine";
import { loadHumanProfiles, loadMatchIntent, matchProject } from "@odp/matching-engine";
import { intakeHuman } from "../src/human-intake.js";
import { persistHumanIntake } from "../src/persist.js";
import { runPilot } from "../src/runner.js";
import { HELIOS_BRIEF, HUMAN_INTAKES, PILOT_FIXTURES, tempPilotDir } from "./helpers.js";

function seedHumans(dataDir: string): void {
  for (const file of HUMAN_INTAKES) {
    persistHumanIntake(intakeHuman(JSON.parse(readFileSync(file, "utf8"))), dataDir);
  }
}

describe("generic pilot runner (non-Aurora)", () => {
  it("matches a Helios intent against synthetic opt-in humans and writes merkle inputs", () => {
    const dataDir = tempPilotDir();
    seedHumans(dataDir);
    const result = runPilot({ dataDir, briefFile: HELIOS_BRIEF });

    assert.equal(result.inputs.project_id, "prj_helios_mesh");
    assert.notEqual(result.inputs.project_id, "prj_aurora_net");
    assert.equal(result.passport.status, "ALLOW");
    assert.ok(!result.inputs.humans.some((h) => ["hum_maya", "hum_dev_dan", "hum_sib"].includes(h.human_id)));

    const ranked = result.inputs.matches.map((m) => m.human_id);
    assert.deepEqual(ranked, ["hum_pilot_ada", "hum_pilot_ben", "hum_pilot_cy"]);
    assert.ok(result.inputs.matches[0]!.match_score > result.inputs.matches[1]!.match_score);
    assert.ok(result.inputs.matches[0]!.match_score > 0);
    assert.ok(result.inputs.matches.every((m) => m.match_reasons.length >= 1));

    assert.deepEqual(
      result.inputs.allocations.map((a) => a.human_id).sort(),
      ["hum_pilot_ada", "hum_pilot_ben"],
    );
    assert.deepEqual(
      result.inputs.allocations.map((a) => a.amount),
      ["5000", "5000"],
    );

    assert.match(result.inputs.merkle.root, /^[0-9a-f]{64}$/);
    for (const a of result.inputs.allocations) {
      const leaf = allocationLeaf(a);
      const proof = (result.inputs.merkle.proofs[a.wallet] ?? []).map((h) => Buffer.from(h, "hex"));
      assert.equal(verifyMerkleProof(leaf, proof, Buffer.from(result.inputs.merkle.root, "hex")), true);
    }
    assert.match(result.inputs.manifest_hash, /^[0-9a-f]{64}$/);
    assert.ok(result.outputFile.includes(result.inputs.distribution_id));
  });
});

describe("Aurora golden path still works (engine, not demo-hardbound)", () => {
  it("Maya > Dan > Sib(blocked) from existing fixtures", () => {
    const passportFixtures = path.resolve(PILOT_FIXTURES, "../../passport-engine/fixtures");
    const matchingFixtures = path.resolve(PILOT_FIXTURES, "../../matching-engine/fixtures");
    const candidates = new FixtureDiscoverySource(path.join(passportFixtures, "discovery")).discover();
    const bundles = loadEvidenceBundles(path.join(passportFixtures, "evidence"));
    const aurora = candidates.find((c) => c.project_id === "prj_aurora_net");
    const bundle = bundles.find((b) => b.project_id === "prj_aurora_net");
    assert.ok(aurora && bundle);
    const passport = generatePassport(aurora, bundle);
    const intent = loadMatchIntent(path.join(matchingFixtures, "intents", "prj_aurora_net.intent.json"));
    const humans = loadHumanProfiles(path.join(matchingFixtures, "humans"));
    const matches = matchProject({ passport, intent, humans });
    assert.deepEqual(
      matches.map((m) => m.human_id),
      ["hum_maya", "hum_dev_dan", "hum_sib"],
    );
    assert.ok(matches[0]!.match_score > matches[1]!.match_score);
    assert.equal(matches[2]!.match_score, 0);
    assert.equal(passport.status, "ALLOW");
  });
});
