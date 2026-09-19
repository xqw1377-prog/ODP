import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectOnchain,
  collectSocial,
  collectCode,
  collectTeam,
  collectProduct,
  collectToken,
  FindingKindSchema,
  ObservationSchema,
  type Observation,
} from "@odp/passport-engine";
import { FINDING_OWNERSHIP } from "../src/finding-ownership.js";
import type { Dimension } from "../src/schema.js";

/* Drift test: the pilot's local finding→dimension map must stay in exact
   lockstep with the frozen collectors. If the frozen map changes, this file
   fails before any real evidence can be mis-filed. */

const T = "2026-09-19T00:00:00Z";

type Collector = (obs: Observation[], at: string) => unknown;

const COLLECTORS: Record<Dimension, Collector> = {
  TEAM: collectTeam,
  PRODUCT: collectProduct,
  CODE: collectCode,
  TOKEN: collectToken,
  ONCHAIN: collectOnchain,
  SOCIAL: collectSocial,
};

function obs(kind: string): Observation[] {
  return [
    ObservationSchema.parse({ source: "drift-test", detail: "d", url: null, at: T, findings: [kind] }),
  ];
}

test("pilot map covers every frozen FindingKind exactly once", () => {
  const all = [...FindingKindSchema.options].sort();
  const mapped = Object.values(FINDING_OWNERSHIP).flat().sort();
  assert.deepEqual(mapped, all);
});

test("every mapped (dimension, kind) pair is accepted by the frozen collector", () => {
  for (const [dim, kinds] of Object.entries(FINDING_OWNERSHIP) as [Dimension, readonly string[]][]) {
    for (const kind of kinds) {
      assert.doesNotThrow(() => COLLECTORS[dim](obs(kind), T), `${dim} collector rejected ${kind}`);
    }
  }
});

test("foreign kinds are rejected by each frozen collector (fail closed)", () => {
  for (const [dim, collector] of Object.entries(COLLECTORS) as [Dimension, (o: unknown[], a: string) => unknown][]) {
    for (const [other, kinds] of Object.entries(FINDING_OWNERSHIP) as [Dimension, readonly string[]][]) {
      if (other === dim) continue;
      for (const kind of kinds) {
        assert.throws(() => collector(obs(kind), T), `${dim} collector accepted foreign kind ${kind}`);
      }
    }
  }
});
