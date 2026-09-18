import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { computeDemoSnapshot, mayaWhyYou, HUMAN_DISPLAY } from "../src/demo-data.js";

/**
 * P0-5 §18: the demo UI is forbidden from faking results. These tests pin
 * the demo-data bridge to the REAL pipeline outputs — if passport rules,
 * matching or allocation policy change, these numbers follow them.
 */

describe("demo snapshot comes from the real pipelines (no hardcoding)", () => {
  const snap = computeDemoSnapshot();

  it("radar shows the real three rulings: ALLOW / WATCH / REJECT", () => {
    const statuses = Object.fromEntries(snap.radar.map((r) => [r.project_id, r.status]));
    assert.deepEqual(statuses, {
      prj_aurora_net: "ALLOW",
      prj_nimbus_dex: "WATCH",
      prj_phantomx: "REJECT",
    });
  });

  it("aurora passport is ALLOW with all six dimensions", () => {
    assert.equal(snap.auroraPassport.status, "ALLOW");
    assert.deepEqual(Object.keys(snap.auroraPassport.dims), [
      "TEAM",
      "PRODUCT",
      "CODE",
      "TOKEN",
      "ONCHAIN",
      "SOCIAL",
    ]);
  });

  it("matching ranking is computed, not staged: maya > dan > sib(blocked)", () => {
    assert.deepEqual(snap.matches.map((m) => m.human_id), ["hum_maya", "hum_dev_dan", "hum_sib"]);
    assert.ok(snap.matches[0]!.match_score > snap.matches[1]!.match_score);
    assert.equal(snap.matches[2]!.match_score, 0);
  });

  it("allocation policy: top-2 eligible, equal 5000/5000 (Invariant #3)", () => {
    const amounts = snap.allocations.map((a) => [a.human_id, a.amount]).sort();
    assert.deepEqual(amounts, [
      ["hum_dev_dan", "5000"],
      ["hum_maya", "5000"],
    ]);
    assert.ok(!snap.allocations.some((a) => a.human_id === "hum_sib"));
  });

  it("maya 'why you' lines derive from her real match reasons", () => {
    const why = mayaWhyYou(snap.matches);
    assert.ok(why.length >= 4, why.join(", "));
    assert.ok(why.includes("High human confidence"));
    assert.ok(why.some((w) => /solana/i.test(w)));
  });

  it("display names are presentation-only and cover the fixture humans", () => {
    for (const id of ["hum_maya", "hum_dev_dan", "hum_sib"]) {
      assert.ok(HUMAN_DISPLAY[id], id);
    }
  });
});
