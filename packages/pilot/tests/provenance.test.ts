import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHumanConfidence, noEvidenceScore } from "../src/provenance.js";

const T = "2026-09-19T00:00:00Z";

test("D2-R: human_confidence is derived from identity evidence, nothing else", () => {
  const nothing = computeHumanConfidence({ wallet_verified: false, x_identity_status: "NONE" }, T);
  assert.equal(nothing.value, 0);

  const declaredOnly = computeHumanConfidence({ wallet_verified: false, x_identity_status: "SELF_DECLARED" }, T);
  assert.equal(declaredOnly.value, 0.1);

  const walletOnly = computeHumanConfidence({ wallet_verified: true, x_identity_status: "NONE" }, T);
  assert.equal(walletOnly.value, 0.4);

  const typical = computeHumanConfidence({ wallet_verified: true, x_identity_status: "SELF_DECLARED" }, T);
  assert.equal(typical.value, 0.5); // V0 real human baseline

  const xVerified = computeHumanConfidence({ wallet_verified: true, x_identity_status: "X_VERIFIED" }, T);
  assert.equal(xVerified.value, 0.8);
});

test("D2-R: every score carries WHY it exists (provenance), not just the number", () => {
  const s = computeHumanConfidence({ wallet_verified: true, x_identity_status: "SELF_DECLARED" }, T);
  assert.equal(s.source, "DERIVED");
  assert.match(s.evidence, /wallet ownership/);
  assert.match(s.evidence, /self-declared/);
  assert.equal(s.computed_at, T);
});

test("D2-R: reputation and network_score stay honest zero until real evidence exists", () => {
  const rep = noEvidenceScore("reputation", T);
  const net = noEvidenceScore("network_score", T);
  assert.equal(rep.value, 0);
  assert.equal(net.value, 0);
  assert.equal(rep.source, "NONE");
  assert.equal(net.source, "NONE");
  assert.match(rep.evidence, /honest zero/);
});

test("confidence never exceeds 1 even if future bonuses stack", () => {
  // current max: 0.4 + 0.4 + 0.1 = 0.9; the cap guards future extensions
  const capped = computeHumanConfidence({ wallet_verified: true, x_identity_status: "X_VERIFIED" }, T);
  assert.ok(capped.value <= 1);
});
