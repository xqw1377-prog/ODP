import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ProjectPassportSchema } from "@odp/domain";
import type { ProjectCandidate } from "@odp/domain";
import {
  FixtureDiscoverySource,
  loadEvidenceBundles,
  generatePassport,
  reassessFromEvidence,
  EvidenceBundleSchema,
} from "../src/index.js";
import type { EvidenceBundle } from "../src/index.js";
import { DISCOVERY_DIR, EVIDENCE_DIR, EXPECTED_DIR } from "./helpers.js";

function discoverCandidates(): ProjectCandidate[] {
  return new FixtureDiscoverySource(DISCOVERY_DIR).discover();
}

function loadBundles(): EvidenceBundle[] {
  return loadEvidenceBundles(EVIDENCE_DIR);
}

function pairUp(): Array<{ name: string; candidate: ProjectCandidate; bundle: EvidenceBundle }> {
  const byId = new Map(discoverCandidates().map((c) => [c.project_id, c]));
  return loadBundles().map((bundle) => {
    const candidate = byId.get(bundle.project_id);
    if (candidate === undefined) throw new Error(`no candidate for ${bundle.project_id}`);
    return { name: bundle.project_id, candidate, bundle };
  });
}

const EXPECTED_STATUS: Record<string, string> = {
  prj_aurora_net: "ALLOW",
  prj_nimbus_dex: "WATCH",
  prj_phantomx: "REJECT",
};

// ── G2 golden path: raw inputs → pipeline → derived ruling ─────────────

describe("G2 golden path (candidate + raw evidence → passport)", () => {
  it("discovers exactly three candidates from the fixture source", () => {
    const candidates = discoverCandidates();
    assert.equal(candidates.length, 3);
  });

  for (const { name, candidate, bundle } of pairUp()) {
    it(`${name}: pipeline output = golden expected passport (${EXPECTED_STATUS[name]})`, () => {
      const passport = generatePassport(candidate, bundle);
      const expected = ProjectPassportSchema.parse(
        JSON.parse(readFileSync(path.join(EXPECTED_DIR, `${name}.passport.json`), "utf8")),
      );
      assert.deepEqual(passport, expected);
      assert.equal(passport.status, EXPECTED_STATUS[name]);
    });
  }

  it("same inputs → byte-stable ruling (generate twice, deep-equal)", () => {
    for (const { candidate, bundle } of pairUp()) {
      assert.deepEqual(generatePassport(candidate, bundle), generatePassport(candidate, bundle));
    }
  });

  it("golden passports are NOT pipeline inputs (evidence files are not passports)", () => {
    for (const { bundle } of pairUp()) {
      const raw = EvidenceBundleSchema.parse(bundle);
      assert.equal(ProjectPassportSchema.safeParse(raw).success, false);
    }
  });
});

// ── Missing / malformed evidence ───────────────────────────────────────

describe("evidence edge cases", () => {
  it("missing dimension evidence → WATCH (not ALLOW)", () => {
    const aurora = pairUp().find((p) => p.name === "prj_aurora_net")!;
    const bundle = structuredClone(aurora.bundle);
    bundle.observations.PRODUCT = [];
    const passport = generatePassport(aurora.candidate, bundle);
    assert.equal(passport.status, "WATCH");
    assert.ok(passport.reasons.some((r) => r.includes("PRODUCT=IDEA")));
    assert.ok(passport.dims.PRODUCT.unknowns.includes("no product evidence collected"));
  });

  it("malformed evidence (missing detail) → reject", () => {
    const aurora = pairUp().find((p) => p.name === "prj_aurora_net")!;
    const bundle = structuredClone(aurora.bundle) as unknown as {
      observations: { TEAM: Array<Record<string, unknown>> };
    };
    delete bundle.observations.TEAM[0]!.detail;
    assert.throws(() => generatePassport(aurora.candidate, bundle as never));
  });

  it("malformed evidence (empty findings array) → reject", () => {
    const aurora = pairUp().find((p) => p.name === "prj_aurora_net")!;
    const bundle = structuredClone(aurora.bundle);
    bundle.observations.TEAM[0]!.findings = [];
    assert.throws(() => generatePassport(aurora.candidate, bundle));
  });

  it("finding owned by the wrong dimension → reject", () => {
    const aurora = pairUp().find((p) => p.name === "prj_aurora_net")!;
    const bundle = structuredClone(aurora.bundle);
    bundle.observations.TEAM[0]!.findings = ["HONEYPOT_PATTERN"];
    assert.throws(() => generatePassport(aurora.candidate, bundle), /TEAM collector/);
  });

  it("unknown finding kind → reject at schema level", () => {
    const aurora = pairUp().find((p) => p.name === "prj_aurora_net")!;
    const bundle = structuredClone(aurora.bundle);
    bundle.observations.TEAM[0]!.findings = ["MAGIC_TRUST_SIGNAL" as never];
    assert.throws(() => generatePassport(aurora.candidate, bundle));
  });

  it("bundle belonging to another project → reject", () => {
    const aurora = pairUp().find((p) => p.name === "prj_aurora_net")!;
    const nimbus = pairUp().find((p) => p.name === "prj_nimbus_dex")!;
    assert.throws(() => generatePassport(aurora.candidate, nimbus.bundle), /does not belong/);
  });

  it("invalid maturity value → reject", () => {
    const aurora = pairUp().find((p) => p.name === "prj_aurora_net")!;
    const bundle = structuredClone(aurora.bundle);
    bundle.maturity = "AI_AUDITED" as never;
    assert.throws(() => generatePassport(aurora.candidate, bundle));
  });
});

// ── Continuous audit: reassessment with preserved history ──────────────

describe("reassessment pipeline", () => {
  function honeypotBundleAfter(base: EvidenceBundle): EvidenceBundle {
    const bundle = structuredClone(base);
    bundle.collected_at = "2026-09-19T00:00:00Z";
    bundle.observations.TOKEN = [
      {
        source: "onchain",
        detail: "Honeypot pattern detected on previously healthy token",
        url: null,
        at: "2026-09-19T00:00:00Z",
        findings: ["HONEYPOT_PATTERN"],
      },
    ];
    return bundle;
  }

  it("ALLOW → REJECT after new TOKEN fatal evidence, history preserved", () => {
    const aurora = pairUp().find((p) => p.name === "prj_aurora_net")!;
    const first = generatePassport(aurora.candidate, aurora.bundle);
    assert.equal(first.status, "ALLOW");

    const second = reassessFromEvidence(
      first,
      honeypotBundleAfter(aurora.bundle),
      "continuous audit: honeypot pattern detected on token",
    );
    assert.equal(second.status, "REJECT");
    assert.ok(second.reasons.some((r) => r.includes("TOKEN=MALICIOUS")));
    assert.equal(second.status_history.length, 2);
    assert.equal(second.status_history[0]!.from, "DISCOVERED");
    assert.equal(second.status_history[0]!.to, "ALLOW"); // initial history intact
    assert.equal(second.status_history[1]!.from, "ALLOW");
    assert.equal(second.status_history[1]!.to, "REJECT");
    assert.equal(second.status_history[1]!.reason, "continuous audit: honeypot pattern detected on token");
  });

  it("unchanged evidence → same ruling, no history append", () => {
    const aurora = pairUp().find((p) => p.name === "prj_aurora_net")!;
    const first = generatePassport(aurora.candidate, aurora.bundle);
    const again = reassessFromEvidence(first, structuredClone(aurora.bundle));
    assert.equal(again.status, "ALLOW");
    assert.equal(again.status_history.length, 1);
  });

  it("recovery: fatal evidence disproven → REJECT back to ALLOW", () => {
    const phantomx = pairUp().find((p) => p.name === "prj_phantomx")!;
    const aurora = pairUp().find((p) => p.name === "prj_aurora_net")!;
    const first = generatePassport(phantomx.candidate, phantomx.bundle);
    assert.equal(first.status, "REJECT");
    const healed = structuredClone(aurora.bundle);
    healed.project_id = phantomx.bundle.project_id;
    const second = reassessFromEvidence(first, healed, "re-audit: fatal evidence disproven");
    assert.equal(second.status, "ALLOW");
    assert.equal(second.status_history.at(-1)!.to, "ALLOW");
  });
});
