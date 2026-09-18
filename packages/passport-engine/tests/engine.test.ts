import { describe, it, before } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProjectPassportSchema } from "@odp/domain";
import type { ProjectCandidate, ProjectPassport } from "@odp/domain";
import { FixtureDiscoverySource, loadEvidenceBundles, PassportEngine } from "../src/index.js";
import type { EvidenceBundle } from "../src/index.js";
import { DISCOVERY_DIR, EVIDENCE_DIR } from "./helpers.js";

function seededEngine(): { engine: PassportEngine; candidates: ProjectCandidate[]; bundles: EvidenceBundle[] } {
  const dir = mkdtempSync(path.join(tmpdir(), "odp-passport-engine-"));
  const engine = new PassportEngine({ dataDir: dir });
  const candidates = engine.discoverAndIngest(new FixtureDiscoverySource(DISCOVERY_DIR));
  const bundles = loadEvidenceBundles(EVIDENCE_DIR);
  return { engine, candidates, bundles };
}

function bundleFor(bundles: EvidenceBundle[], project_id: string): EvidenceBundle {
  const b = bundles.find((x) => x.project_id === project_id);
  if (b === undefined) throw new Error(`no bundle for ${project_id}`);
  return b;
}

function honeypotReassessmentBundle(base: EvidenceBundle): EvidenceBundle {
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

// ── Store: validated persistence, atomic writes, read-side lock ────────

describe("validated persistence", () => {
  const { engine, candidates, bundles } = seededEngine();
  const generated: ProjectPassport[] = [];

  before(() => {
    for (const c of candidates) {
      generated.push(engine.generateFromBundle(c, bundleFor(bundles, c.project_id)));
    }
  });

  it("store round-trip: read-back equals generated passport (atomic write path)", () => {
    for (const p of generated) {
      assert.deepEqual(engine.passports.get(p.project_id), p);
    }
    assert.equal(engine.passports.list().length, 3);
  });

  it("save is an idempotent overwrite (atomic rename onto existing file)", () => {
    const aurora = generated.find((p) => p.project_id === "prj_aurora_net")!;
    engine.passports.save(aurora);
    assert.deepEqual(engine.passports.get("prj_aurora_net"), aurora);
  });

  it("forged persisted passport → read fails loudly (derivation lock on read)", () => {
    const aurora = generated.find((p) => p.project_id === "prj_aurora_net")!;
    const file = engine.passports.filePath("prj_aurora_net");
    const forged = {
      ...aurora,
      status: "REJECT",
      reasons: ["I don't like this project"],
      status_history: [{ from: "DISCOVERED", to: "REJECT", reason: "initial ruling", at: aurora.updated_at }],
    };
    writeFileSync(file, JSON.stringify(forged, null, 2), "utf8");
    assert.throws(() => engine.passports.get("prj_aurora_net"), /contradicts the evidence|canonical/);
    // restore for later tests
    engine.passports.save(aurora);
  });

  it("hand-edited unknown field in persisted file → read fails", () => {
    const aurora = generated.find((p) => p.project_id === "prj_aurora_net")!;
    const file = engine.passports.filePath("prj_aurora_net");
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    raw.magic_trust_score = 999;
    writeFileSync(file, JSON.stringify(raw), "utf8");
    assert.throws(() => engine.passports.get("prj_aurora_net"));
    engine.passports.save(aurora);
  });

  it("path traversal ids rejected on get and save", () => {
    assert.throws(() => engine.passports.get("../../evil"));
    assert.throws(() => engine.passports.get("..\\evil"));
    const aurora = generated.find((p) => p.project_id === "prj_aurora_net")!;
    assert.throws(() => engine.passports.save({ ...aurora, project_id: "../evil" }));
  });

  it("unknown project → get returns null; reassess throws", () => {
    assert.equal(engine.passports.get("prj_unknown"), null);
    assert.throws(() => engine.reassessProject("prj_unknown", bundleFor(bundles, "prj_aurora_net")), /no persisted passport/);
  });
});

// ── Engine: reassessment through the store ─────────────────────────────

describe("engine reassessment end-to-end", () => {
  it("persisted ALLOW → new fatal evidence → persisted REJECT with history", () => {
    const { engine, candidates, bundles } = seededEngine();
    const aurora = candidates.find((c) => c.project_id === "prj_aurora_net")!;
    const first = engine.generateFromBundle(aurora, bundleFor(bundles, "prj_aurora_net"));
    assert.equal(first.status, "ALLOW");

    const second = engine.reassessProject(
      "prj_aurora_net",
      honeypotReassessmentBundle(bundleFor(bundles, "prj_aurora_net")),
      "continuous audit: honeypot pattern detected on token",
    );
    assert.equal(second.status, "REJECT");

    const persisted = engine.passports.get("prj_aurora_net");
    assert.notEqual(persisted, null);
    assert.equal(persisted!.status, "REJECT");
    assert.equal(persisted!.status_history.length, 2);
    assert.equal(persisted!.status_history[0]!.to, "ALLOW");
    assert.equal(persisted!.status_history[1]!.from, "ALLOW");
    assert.equal(persisted!.status_history[1]!.to, "REJECT");
  });
});

// ── Read models ────────────────────────────────────────────────────────

describe("radar + detail read models", () => {
  const { engine, candidates, bundles } = seededEngine();

  before(() => {
    for (const c of candidates) {
      engine.generateFromBundle(c, bundleFor(bundles, c.project_id));
    }
  });

  it("radar lists all three projects with rulings from persisted passports", () => {
    const all = engine.radar();
    assert.equal(all.length, 3);
    const statuses = Object.fromEntries(all.map((r) => [r.project_id, r.status]));
    assert.deepEqual(statuses, {
      prj_aurora_net: "ALLOW",
      prj_nimbus_dex: "WATCH",
      prj_phantomx: "REJECT",
    });
    for (const r of all) {
      const persisted = engine.passports.get(r.project_id)!;
      assert.deepEqual(r.reasons, persisted.reasons);
      assert.equal(r.updated_at, persisted.updated_at);
    }
  });

  it("radar filters ALLOW / WATCH / REJECT", () => {
    assert.deepEqual(engine.radar("ALLOW").map((r) => r.project_id), ["prj_aurora_net"]);
    assert.deepEqual(engine.radar("WATCH").map((r) => r.project_id), ["prj_nimbus_dex"]);
    assert.deepEqual(engine.radar("REJECT").map((r) => r.project_id), ["prj_phantomx"]);
    assert.equal(engine.radar("ALL").length, 3);
  });

  it("detail returns candidate + six dimensions with provenance", () => {
    const detail = engine.getProjectPassport("prj_phantomx");
    assert.notEqual(detail, null);
    assert.equal(detail!.candidate.name, "PhantomX");
    assert.equal(detail!.passport.dims.TEAM.status, "UNVERIFIED");
    assert.equal(detail!.passport.dims.TOKEN.status, "MALICIOUS");
    assert.ok(detail!.passport.dims.TOKEN.evidence.every((e) => e.source && e.detail && e.at));
    assert.ok(detail!.passport.status_history.length >= 1);
    assert.ok(detail!.passport.reasons.length >= 1);
  });

  it("detail for unknown project returns null", () => {
    assert.equal(engine.getProjectPassport("prj_unknown"), null);
  });

  it("persisted passport without candidate record → radar fails loudly", () => {
    const file = engine.candidates.filePath("prj_phantomx");
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...raw, project_id: "prj_orphaned" }), "utf8");
    assert.throws(() => engine.radar(), /no candidate record/);
  });
});
