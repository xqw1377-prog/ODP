import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  ProjectPassportSchema,
  aggregatePassportStatus,
  buildPassport,
  transitionPassport,
} from "../src/index.js";
import type { ProjectPassport } from "../src/index.js";
import { loadJson } from "./helpers.js";

const CASES = [
  { fixture: "aurora", expected: "ALLOW" },
  { fixture: "nimbus", expected: "WATCH" },
  { fixture: "phantomx", expected: "REJECT" },
] as const;

// ── G2 skeleton: rule aggregation reproduces the golden fixtures ───────

describe("passport aggregation (deterministic, explainable)", () => {
  for (const { fixture, expected } of CASES) {
    it(`${fixture} fixture aggregates to ${expected}`, () => {
      const passport = ProjectPassportSchema.parse(
        loadJson(`../fixtures/passports/${fixture}.passport.json`),
      );
      const ruling = aggregatePassportStatus(passport.dims);
      assert.equal(ruling.status, expected);
      assert.ok(ruling.reasons.length > 0, "ruling must be explainable");
    });
  }

  it("aggregation is deterministic (same dims → same result)", () => {
    const dims = ProjectPassportSchema.parse(
      loadJson("../fixtures/passports/nimbus.passport.json"),
    ).dims;
    assert.deepEqual(aggregatePassportStatus(dims), aggregatePassportStatus(dims));
  });

  it("buildPassport from phantomx dims reproduces the REJECT passport", () => {
    const fixture = ProjectPassportSchema.parse(
      loadJson("../fixtures/passports/phantomx.passport.json"),
    );
    const rebuilt = buildPassport("prj_phantomx", fixture.dims, "2026-09-12T11:30:00Z");
    assert.equal(rebuilt.status, "REJECT");
    assert.equal(rebuilt.status_history.length, 1);
    assert.equal(rebuilt.status_history[0]!.from, "DISCOVERED");
  });
});

// ── State machine: continuous audit transitions ────────────────────────

describe("passport state machine", () => {
  const allowPassport = (): ProjectPassport =>
    ProjectPassportSchema.parse(loadJson("../fixtures/passports/aurora.passport.json"));

  it("ALLOW → WATCH downgrade records history with reason", () => {
    const next = transitionPassport(
      allowPassport(),
      "WATCH",
      "team wallet anomaly: unannounced treasury transfer",
      "2026-09-15T08:00:00Z",
    );
    assert.equal(next.status, "WATCH");
    assert.equal(next.status_history.length, 2);
    assert.equal(next.status_history[1]!.from, "ALLOW");
    assert.equal(next.status_history[1]!.to, "WATCH");
    assert.deepEqual(next.reasons, ["team wallet anomaly: unannounced treasury transfer"]);
  });

  it("WATCH → ALLOW recovery records history", () => {
    const watch = transitionPassport(allowPassport(), "WATCH", "warning observed", "2026-09-15T08:00:00Z");
    const recovered = transitionPassport(watch, "ALLOW", "warning resolved: evidence updated", "2026-09-16T08:00:00Z");
    assert.equal(recovered.status, "ALLOW");
    assert.equal(recovered.status_history.length, 3);
  });

  it("WATCH → REJECT escalation (e.g. rug pattern detected)", () => {
    const watch = ProjectPassportSchema.parse(loadJson("../fixtures/passports/nimbus.passport.json"));
    const rejected = transitionPassport(watch, "REJECT", "liquidity removed by deployer", "2026-09-17T00:00:00Z");
    assert.equal(rejected.status, "REJECT");
  });

  it("REJECT is terminal in P0", () => {
    const reject = ProjectPassportSchema.parse(loadJson("../fixtures/passports/phantomx.passport.json"));
    assert.throws(() => transitionPassport(reject, "ALLOW", "appeal", "2026-09-18T00:00:00Z"), /terminal/);
    assert.throws(() => transitionPassport(reject, "WATCH", "recheck", "2026-09-18T00:00:00Z"), /terminal/);
  });

  it("same-state transition is a no-op (no history entry)", () => {
    const p = allowPassport();
    assert.equal(transitionPassport(p, "ALLOW", "re-confirmed", "2026-09-18T00:00:00Z"), p);
  });
});
