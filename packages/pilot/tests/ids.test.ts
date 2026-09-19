import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newClaimId,
  newDistributionId,
  newHumanId,
  newNonce,
  newProjectId,
  slugify,
} from "../src/ids.js";

test("human ids match the frozen sidecar pattern hum_<12 lowercase>", () => {
  for (let i = 0; i < 20; i++) assert.match(newHumanId(), /^hum_[a-z0-9]{12}$/);
});

test("claim ids match clm_<10> and nonces are 32 hex chars", () => {
  assert.match(newClaimId(), /^clm_[a-z0-9]{10}$/);
  assert.match(newNonce(), /^[a-f0-9]{32}$/);
});

test("ids are random enough that 50 humans never collide", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) seen.add(newHumanId());
  assert.equal(seen.size, 50);
});

test("slugify normalizes handles/names to safe slugs", () => {
  assert.equal(slugify("Aurora Net"), "aurora_net");
  assert.equal(slugify("  DePIN Warriors!! "), "depin_warriors");
  assert.equal(slugify("///"), "x");
  assert.equal(slugify("ABC-def_gh"), "abc_def_gh");
  assert.equal(slugify("x".repeat(100)).length, 24);
});

test("project ids are derived from name and collisions get a suffix", () => {
  const taken = new Set<string>();
  const id = newProjectId("Aurora Net", (c) => taken.has(c));
  assert.equal(id, "prj_aurora_net");
  taken.add(id);
  const second = newProjectId("Aurora Net", (c) => taken.has(c));
  assert.notEqual(second, id);
  assert.match(second, /^prj_aurora_net_[a-z0-9]{4}$/);
});

test("distribution ids carry the pilot structure (any string passes frozen checks)", () => {
  assert.match(newDistributionId("aurora_net"), /^dst_aurora_net_pilot_\d{14}$/);
});
