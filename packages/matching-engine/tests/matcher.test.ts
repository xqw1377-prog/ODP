import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { MatchResultSchema, ProjectPassportSchema } from "@odp/domain";
import type { HumanProfile, MatchResult, ProjectPassport } from "@odp/domain";
import {
  FixtureDiscoverySource,
  loadEvidenceBundles,
  generatePassport,
} from "@odp/passport-engine";
import { ProjectMatchIntentSchema } from "../src/index.js";
import type { ProjectMatchIntent } from "../src/index.js";
import {
  MATCH_WEIGHTS,
  interestOverlap,
  loadHumanProfiles,
  loadMatchIntent,
  matchProject,
} from "../src/index.js";
import { OWN_FIXTURES, PASSPORT_FIXTURES } from "./helpers.js";
import path from "node:path";

function passportOf(projectId: string): ProjectPassport {
  const candidates = new FixtureDiscoverySource(path.join(PASSPORT_FIXTURES, "discovery")).discover();
  const bundles = loadEvidenceBundles(path.join(PASSPORT_FIXTURES, "evidence"));
  const candidate = candidates.find((c) => c.project_id === projectId);
  const bundle = bundles.find((b) => b.project_id === projectId);
  if (candidate === undefined || bundle === undefined) throw new Error(`fixture missing for ${projectId}`);
  return generatePassport(candidate, bundle);
}

function auroraCase(): { passport: ProjectPassport; humans: HumanProfile[]; intent: ProjectMatchIntent } {
  return {
    passport: passportOf("prj_aurora_net"),
    humans: loadHumanProfiles(path.join(OWN_FIXTURES, "humans")),
    intent: loadMatchIntent(path.join(OWN_FIXTURES, "intents", "prj_aurora_net.intent.json")),
  };
}

function scoreById(results: MatchResult[]): Record<string, MatchResult> {
  return Object.fromEntries(results.map((r) => [r.human_id, r]));
}

// ── Trust gate ─────────────────────────────────────────────────────────

describe("trust gate (ALLOW required)", () => {
  it("ALLOW project → matching PASS (3 results)", () => {
    const { passport, humans, intent } = auroraCase();
    const results = matchProject({ passport, intent, humans });
    assert.equal(results.length, 3);
  });

  it("WATCH project → MATCH DENIED", () => {
    const { humans } = auroraCase();
    const nimbus = passportOf("prj_nimbus_dex");
    const nimbusIntent = { project_id: "prj_nimbus_dex", target_tags: ["solana", "defi"] };
    assert.throws(() => matchProject({ passport: nimbus, intent: nimbusIntent, humans }), /MATCH DENIED.*WATCH/);
  });

  it("REJECT project → MATCH DENIED", () => {
    const { humans } = auroraCase();
    const phantomx = passportOf("prj_phantomx");
    const phantomxIntent = { project_id: "prj_phantomx", target_tags: ["memecoin"] };
    assert.throws(() => matchProject({ passport: phantomx, intent: phantomxIntent, humans }), /MATCH DENIED.*REJECT/);
  });
});

// ── The fixed demo case ────────────────────────────────────────────────

describe("G3 demo case: Aurora × maya / dev_dan / sib", () => {
  const { passport, humans, intent } = auroraCase();
  const results = matchProject({ passport, intent, humans });
  const byId = scoreById(results);

  it("all results validate against the frozen MatchResult schema with non-empty reasons", () => {
    for (const r of results) {
      MatchResultSchema.parse(r);
      assert.ok(r.match_reasons.length >= 1);
    }
  });

  it("Maya is a strong match with explicit fit reasons", () => {
    const maya = byId.hum_maya!;
    assert.ok(maya.match_score > 0.8);
    assert.deepEqual(maya.match_reasons, [
      "Strong interest fit: solana / depin / early_adopter / hardware",
      "High human confidence",
      "Strong reputation",
      "Healthy network contribution",
    ]);
  });

  it("Dev Dan is a medium match and explains why he ranks below Maya", () => {
    const dan = byId.hum_dev_dan!;
    assert.ok(dan.match_score > 0.2 && dan.match_score < 0.7);
    assert.ok(dan.match_reasons.some((r) => r.startsWith("Partial interest fit: solana (1 of 4")));
    assert.ok(dan.match_reasons.includes("Developer background noted, but current project target fit is limited"));
  });

  it("Sib is hard-blocked at score 0 with risk reasons", () => {
    const sib = byId.hum_sib!;
    assert.equal(sib.match_score, 0);
    assert.deepEqual(sib.match_reasons, ["blocked: SYBIL risk", "blocked: WALLET_CLUSTER risk"]);
  });

  it("ranking is Maya > Dev Dan > Sib, computed from inputs", () => {
    assert.deepEqual(results.map((r) => r.human_id), ["hum_maya", "hum_dev_dan", "hum_sib"]);
    assert.ok(results[0]!.match_score > results[1]!.match_score);
    assert.ok(results[1]!.match_score > results[2]!.match_score);
  });

  it("score formula is exactly the four documented factors (no follower count exists)", () => {
    const maya = humans.find((h) => h.human_id === "hum_maya")!;
    const fit = interestOverlap(["solana", "depin", "early_adopter", "hardware"], maya.interest_tags).length / 4;
    const expected =
      Math.round(
        (MATCH_WEIGHTS.interestFit * fit +
          MATCH_WEIGHTS.humanConfidence * maya.human_confidence +
          MATCH_WEIGHTS.reputation * maya.reputation +
          MATCH_WEIGHTS.networkQuality * maya.network_score) *
          10000,
      ) / 10000;
    assert.equal(byId.hum_maya!.match_score, expected);
  });
});

// ── Determinism ────────────────────────────────────────────────────────

describe("determinism", () => {
  it("same inputs → same scores, same reasons, same ranking", () => {
    const { passport, humans, intent } = auroraCase();
    const a = matchProject({ passport, intent, humans });
    const b = matchProject({ passport, intent: structuredClone(intent), humans: structuredClone(humans) });
    assert.deepEqual(a, b);
  });

  it("ties resolve by human_id ASC", () => {
    const { passport, intent } = auroraCase();
    const base = {
      x_id: "@tie",
      wallet: "TieWa11etAddressExample4444444444444444444444",
      human_confidence: 0.9,
      reputation: 0.9,
      network_score: 0.9,
      interest_tags: ["solana"],
      risk_flags: [],
    };
    const humans: HumanProfile[] = [
      { ...base, human_id: "hum_zzz" },
      { ...base, human_id: "hum_aaa" },
    ];
    const ranked = matchProject({ passport, intent, humans });
    assert.deepEqual(ranked.map((r) => r.human_id), ["hum_aaa", "hum_zzz"]);
    assert.equal(ranked[0]!.match_score, ranked[1]!.match_score);
  });
});

// ── Risk gate ──────────────────────────────────────────────────────────

describe("risk gate", () => {
  it("a risk human cannot outbid risk with perfect other scores", () => {
    const { passport, intent } = auroraCase();
    const boosted: HumanProfile = {
      human_id: "hum_boosted_sib",
      x_id: "@boosted_sib",
      wallet: "BoostedSibWa11etExample5555555555555555555",
      human_confidence: 1,
      reputation: 1,
      network_score: 1,
      interest_tags: ["solana", "depin", "early_adopter", "hardware"],
      risk_flags: ["SYBIL"],
    };
    const ranked = matchProject({ passport, intent, humans: [boosted] });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]!.match_score, 0);
    assert.deepEqual(ranked[0]!.match_reasons, ["blocked: SYBIL risk"]);
  });

  it("FARMING flag alone also blocks (all declared risk flags block in P0)", () => {
    const { passport, intent } = auroraCase();
    const farmer: HumanProfile = {
      human_id: "hum_farmer",
      x_id: "@farmer",
      wallet: "FarmerWa11etAddressExample6666666666666666666",
      human_confidence: 0.9,
      reputation: 0.9,
      network_score: 0.9,
      interest_tags: ["solana", "depin"],
      risk_flags: ["FARMING"],
    };
    const ranked = matchProject({ passport, intent, humans: [farmer] });
    assert.equal(ranked[0]!.match_score, 0);
    assert.deepEqual(ranked[0]!.match_reasons, ["blocked: FARMING risk"]);
  });
});

// ── Identity binding & input validation ────────────────────────────────

describe("identity binding and input validation", () => {
  it("empty target_tags → intent REJECT", () => {
    assert.throws(() => ProjectMatchIntentSchema.parse({ project_id: "p", target_tags: [] }));
  });

  it("project_id mismatch between intent and passport → FAIL CLOSED", () => {
    const { passport, humans } = auroraCase();
    const wrongIntent = { project_id: "prj_other", target_tags: ["solana"] };
    assert.throws(() => matchProject({ passport, intent: wrongIntent, humans }), /identity binding/);
  });

  it("MatchResult.project_id and human_id stay bound to inputs", () => {
    const { passport, humans, intent } = auroraCase();
    const results = matchProject({ passport, intent, humans });
    const ids = new Set(humans.map((h) => h.human_id));
    for (const r of results) {
      assert.equal(r.project_id, passport.project_id);
      assert.ok(ids.has(r.human_id));
    }
  });

  it("duplicate human_id input → REJECT", () => {
    const { passport, intent } = auroraCase();
    const humans = loadHumanProfiles(path.join(OWN_FIXTURES, "humans"));
    const doubled = [...humans, humans[0]!];
    assert.throws(() => matchProject({ passport, intent, humans: doubled }), /duplicate human_id/);
  });
});
