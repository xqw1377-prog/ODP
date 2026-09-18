import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import * as domain from "../src/index.js";
import {
  ProjectPassportSchema,
  derivePassportRuling,
  buildPassport,
  reassessPassport,
} from "../src/index.js";
import type { PassportDims, ProjectPassport } from "../src/index.js";
import { loadJson } from "./helpers.js";

const CASES = [
  { fixture: "aurora", expected: "ALLOW" },
  { fixture: "nimbus", expected: "WATCH" },
  { fixture: "phantomx", expected: "REJECT" },
] as const;

function passportOf(fixture: string): ProjectPassport {
  return ProjectPassportSchema.parse(loadJson(`../fixtures/passports/${fixture}.passport.json`));
}
function dimsOf(fixture: string): PassportDims {
  return structuredClone(passportOf(fixture).dims);
}

// ── G2 skeleton: rule aggregation reproduces the golden fixtures ───────

describe("passport ruling derivation (deterministic, explainable)", () => {
  for (const { fixture, expected } of CASES) {
    it(`${fixture} fixture derives ${expected}`, () => {
      const ruling = derivePassportRuling(passportOf(fixture).dims);
      assert.equal(ruling.status, expected);
      assert.ok(ruling.reasons.length > 0, "ruling must be explainable");
    });
  }

  it("derivation is deterministic (same dims → same result)", () => {
    const dims = dimsOf("nimbus");
    assert.deepEqual(derivePassportRuling(dims), derivePassportRuling(dims));
  });

  it("buildPassport from phantomx dims reproduces the REJECT passport", () => {
    const rebuilt = buildPassport("prj_phantomx", dimsOf("phantomx"), "2026-09-12T11:30:00Z");
    assert.equal(rebuilt.status, "REJECT");
    assert.equal(rebuilt.status_history.length, 1);
    assert.equal(rebuilt.status_history[0]!.from, "DISCOVERED");
  });
});

// ── R2: ALLOW requires evidence ────────────────────────────────────────

describe("ALLOW requires evidence (R2)", () => {
  it("baseline-satisfying dims with one empty-evidence dim → WATCH + NO_EVIDENCE reason", () => {
    const dims = dimsOf("aurora");
    dims.SOCIAL.evidence = [];
    const ruling = derivePassportRuling(dims);
    assert.equal(ruling.status, "WATCH");
    assert.ok(ruling.reasons.some((r) => r.startsWith("NO_EVIDENCE: SOCIAL")), ruling.reasons.join("; "));
  });

  it("every empty dimension gets its own NO_EVIDENCE reason", () => {
    const dims = dimsOf("aurora");
    dims.TEAM.evidence = [];
    dims.TOKEN.evidence = [];
    const ruling = derivePassportRuling(dims);
    assert.equal(ruling.status, "WATCH");
    assert.ok(ruling.reasons.some((r) => r === "NO_EVIDENCE: TEAM"));
    assert.ok(ruling.reasons.some((r) => r === "NO_EVIDENCE: TOKEN"));
  });
});

// ── P0-1R2: derivation lock — forged rulings cannot parse ─────────────

describe("derivation lock (P0-1R2)", () => {
  it("forged status on healthy dims rejected (even with consistent history)", () => {
    const bad = passportOf("aurora"); // derives ALLOW
    bad.status = "REJECT";
    bad.reasons = ["I don't like this project"];
    bad.status_history = [
      { from: "DISCOVERED", to: "REJECT", reason: "initial ruling", at: "2026-09-10T09:30:00Z" },
    ];
    assert.throws(() => ProjectPassportSchema.parse(bad), /contradicts the evidence/);
  });

  it("forged reasons rejected even when status matches the derived one", () => {
    const bad = passportOf("nimbus"); // derives WATCH with canonical reasons
    bad.reasons = ["paid partner approved"];
    assert.throws(() => ProjectPassportSchema.parse(bad), /canonical derived ruling/);
  });

  it("correct reasons in non-canonical order rejected", () => {
    const bad = passportOf("phantomx");
    bad.reasons = [...bad.reasons].reverse();
    assert.throws(() => ProjectPassportSchema.parse(bad), /canonical derived ruling/);
  });

  it("golden fixtures still parse with their canonical rulings", () => {
    for (const { fixture } of CASES) {
      ProjectPassportSchema.parse(loadJson(`../fixtures/passports/${fixture}.passport.json`));
    }
  });
});

// ── R3: status is produced by evidence, never dictated ─────────────────

describe("reassessPassport — status is derived, never dictated (R3)", () => {
  it("no API exists that sets the overall status directly", () => {
    assert.equal((domain as unknown as Record<string, unknown>).transitionPassport, undefined);
  });

  it("evidence downgrade: fatal TOKEN evidence turns ALLOW into REJECT with history", () => {
    const dims = dimsOf("aurora");
    dims.TOKEN.status = "MALICIOUS";
    const next = reassessPassport(
      passportOf("aurora"),
      dims,
      "continuous audit: honeypot pattern detected on token",
      "2026-09-19T00:00:00Z",
    );
    assert.equal(next.status, "REJECT");
    assert.ok(next.reasons.some((r) => r.includes("TOKEN=MALICIOUS")));
    assert.equal(next.status_history.length, 2);
    assert.equal(next.status_history[1]!.from, "ALLOW");
    assert.equal(next.status_history[1]!.to, "REJECT");
    assert.equal(next.status_history[1]!.reason, "continuous audit: honeypot pattern detected on token");
  });

  it("evidence recovery: healed dims turn REJECT into ALLOW — no caller-set status", () => {
    const next = reassessPassport(
      passportOf("phantomx"),
      dimsOf("aurora"),
      "re-audit: prior fatal evidence disproven by corrected data",
      "2026-09-19T12:00:00Z",
    );
    assert.equal(next.status, "ALLOW");
    assert.equal(next.status_history.length, 2);
    assert.equal(next.status_history[0]!.from, "DISCOVERED");
    assert.equal(next.status_history[1]!.from, "REJECT");
    assert.equal(next.status_history[1]!.to, "ALLOW");
  });

  it("reassess with unchanged aggregate keeps history untouched", () => {
    const next = reassessPassport(
      passportOf("aurora"),
      dimsOf("aurora"),
      "periodic re-audit, no change",
      "2026-09-20T00:00:00Z",
    );
    assert.equal(next.status, "ALLOW");
    assert.equal(next.status_history.length, 1);
    assert.equal(next.updated_at, "2026-09-20T00:00:00Z");
  });

  it("a caller cannot smuggle a status in: healthy dims never produce REJECT", () => {
    const next = reassessPassport(passportOf("phantomx"), dimsOf("aurora"), "x", "2026-09-20T01:00:00Z");
    assert.equal(next.status, derivePassportRuling(next.dims).status);
    assert.equal(next.status, "ALLOW");
  });

  it("nextDims are validated through the schema", () => {
    const bad = dimsOf("aurora") as unknown as { TEAM: { status: string } };
    bad.TEAM.status = "GREAT";
    assert.throws(() => reassessPassport(passportOf("aurora"), bad as never, "x"));
  });
});
