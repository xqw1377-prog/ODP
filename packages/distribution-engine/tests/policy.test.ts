import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDistribution, allocationLeaf, buildMerkleTree } from "@odp/domain";
import type { Distribution, HumanProfile, MatchResult } from "@odp/domain";
import { FixtureDiscoverySource, loadEvidenceBundles, generatePassport } from "@odp/passport-engine";
import { loadHumanProfiles, loadMatchIntent, matchProject } from "@odp/matching-engine";
import { buildAllocations, P0_ALLOCATION_POLICY, canonicalJson, buildManifest, manifestHash, hashCanonical } from "../src/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PASSPORT_FIXTURES = path.resolve(HERE, "../../passport-engine/fixtures");
const MATCHING_FIXTURES = path.resolve(HERE, "../../matching-engine/fixtures");

const AURORA_TOKEN = "AURAt0kEnAddr3ssExampleX7qVNE9dJm1LkzPwR4TgHc";
const DST_ID = "dst_aurora_demo_001";

function auroraCase(): {
  distribution: Distribution;
  matches: MatchResult[];
  humans: HumanProfile[];
  passport: object;
  intent: object;
} {
  const candidates = new FixtureDiscoverySource(path.join(PASSPORT_FIXTURES, "discovery")).discover();
  const bundles = loadEvidenceBundles(path.join(PASSPORT_FIXTURES, "evidence"));
  const aurora = candidates.find((c) => c.project_id === "prj_aurora_net")!;
  const bundle = bundles.find((b) => b.project_id === "prj_aurora_net")!;
  const passport = generatePassport(aurora, bundle);
  const intent = loadMatchIntent(path.join(MATCHING_FIXTURES, "intents", "prj_aurora_net.intent.json"));
  const humans = loadHumanProfiles(path.join(MATCHING_FIXTURES, "humans"));
  const matches = matchProject({ passport, intent, humans });
  const distribution = createDistribution(DST_ID, "prj_aurora_net", AURORA_TOKEN, "10000", "2026-09-18T00:00:00Z");
  return { distribution, matches, humans, passport, intent };
}

describe("allocation policy (Invariant #3: match ≠ entitlement)", () => {
  it("top-2 equal split: maya + dan get 5000 each, sib (score 0) excluded", () => {
    const { distribution, matches, humans } = auroraCase();
    const allocations = buildAllocations(distribution, matches, humans, P0_ALLOCATION_POLICY);
    assert.deepEqual(
      allocations.map((a) => [a.human_id, a.amount]).sort(),
      [["hum_dev_dan", "5000"], ["hum_maya", "5000"]],
    );
    assert.ok(!allocations.some((a) => a.human_id === "hum_sib"));
    assert.ok(!allocations.some((a) => a.wallet === humans.find((h) => h.human_id === "hum_sib")!.wallet));
  });

  it("equal amounts regardless of score ranking (maya 0.942 vs dan 0.491)", () => {
    const { distribution, matches, humans } = auroraCase();
    const allocations = buildAllocations(distribution, matches, humans);
    assert.equal(allocations[0]!.amount, allocations[1]!.amount);
  });

  it("conservation: Σ allocations === total_amount", () => {
    const { distribution, matches, humans } = auroraCase();
    const allocations = buildAllocations(distribution, matches, humans);
    const sum = allocations.reduce((acc, a) => acc + BigInt(a.amount), 0n);
    assert.equal(sum, BigInt(distribution.total_amount));
  });

  it("topN = 1 → single allocation of the full amount", () => {
    const { distribution, matches, humans } = auroraCase();
    const allocations = buildAllocations(distribution, matches, humans, { topN: 1 });
    assert.equal(allocations.length, 1);
    assert.equal(allocations[0]!.human_id, "hum_maya");
    assert.equal(allocations[0]!.amount, "10000");
  });

  it("non-divisible total → REJECT", () => {
    const { matches, humans } = auroraCase();
    const odd = createDistribution(DST_ID, "prj_aurora_net", AURORA_TOKEN, "9999", "2026-09-18T00:00:00Z");
    assert.throws(() => buildAllocations(odd, matches, humans), /does not divide/);
  });

  it("duplicate wallet across selected humans → REJECT", () => {
    const { distribution, matches, humans } = auroraCase();
    const maya = humans.find((h) => h.human_id === "hum_maya")!;
    const evilTwin: HumanProfile = { ...maya, human_id: "hum_twin" };
    const twinMatch: MatchResult = {
      project_id: DST_ID,
      human_id: "hum_twin",
      match_score: 0.7,
      match_reasons: ["clone"],
    };
    assert.throws(
      () => buildAllocations(distribution, [...matches, twinMatch], [...humans, evilTwin]),
      /duplicate wallet/,
    );
  });

  it("match result referencing an unknown human → REJECT (identity binding)", () => {
    const { distribution, matches, humans } = auroraCase();
    const ghost: MatchResult = { project_id: DST_ID, human_id: "hum_ghost", match_score: 0.5, match_reasons: ["x"] };
    assert.throws(() => buildAllocations(distribution, [ghost], humans), /unknown human/);
  });

  it("all-zero scores → nothing to allocate", () => {
    const { distribution, humans } = auroraCase();
    const zero: MatchResult[] = humans.map((h) => ({
      project_id: DST_ID,
      human_id: h.human_id,
      match_score: 0,
      match_reasons: ["blocked: SYBIL risk"],
    }));
    assert.throws(() => buildAllocations(distribution, zero, humans), /no eligible humans/);
  });

  it("deterministic: same inputs → same allocations", () => {
    const { distribution, matches, humans } = auroraCase();
    assert.deepEqual(
      buildAllocations(distribution, matches, humans),
      buildAllocations(distribution, structuredClone(matches), structuredClone(humans)),
    );
  });
});

describe("canonical manifest", () => {
  it("canonicalJson is key-order insensitive (sorted keys)", () => {
    const a = { b: 1, a: { z: 1, y: 2 }, c: [3, 2, 1] };
    const b = { c: [3, 2, 1], a: { y: 2, z: 1 }, b: 1 };
    assert.equal(canonicalJson(a), canonicalJson(b));
  });

  it("buildManifest produces a stable hash; any field change changes the hash", () => {
    const { distribution, passport, intent, humans, matches } = auroraCase();
    const allocations = buildAllocations(distribution, matches, humans);
    const root = buildMerkleTree(allocations.map(allocationLeaf)).root.toString("hex");

    const m1 = buildManifest({
      distribution_id: distribution.distribution_id,
      project_id: distribution.project_id,
      token_mint: distribution.token_mint,
      total_amount: distribution.total_amount,
      total_recipients: allocations.length,
      passport,
      matchIntent: intent,
      allocation_root: root,
      created_at: "2026-09-18T00:00:00Z",
    });
    const m2 = buildManifest({
      distribution_id: distribution.distribution_id,
      project_id: distribution.project_id,
      token_mint: distribution.token_mint,
      total_amount: distribution.total_amount,
      total_recipients: allocations.length,
      passport: JSON.parse(JSON.stringify(passport)),
      matchIntent: intent,
      allocation_root: root,
      created_at: "2026-09-18T00:00:00Z",
    });
    assert.equal(manifestHash(m1), manifestHash(m2));

    const mutated = { ...m1, total_amount: "10001" };
    assert.notEqual(manifestHash(mutated), manifestHash(m1));
    assert.equal(hashCanonical({ a: 1 }), hashCanonical({ a: 1 }));
  });
});
