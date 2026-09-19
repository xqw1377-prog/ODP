import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempStore, sampleHuman, T } from "./helpers.js";

test("store saves, reads back, and lists with atomic schema-parsed writes", () => {
  const store = makeTempStore();
  const human = sampleHuman();
  store.humans.save(human);
  assert.deepEqual(store.humans.get(human.human_id), human);
  assert.equal(store.humans.list().length, 1);
  assert.equal(store.humans.get("hum_doesnotexist0"), null);
});

test("store enforces record↔filename binding (swap fails closed)", () => {
  const store = makeTempStore();
  const human = sampleHuman();
  store.humans.save(human);
  // overwrite the file content with a record whose id differs from its filename
  const swapped = { ...human, human_id: "hum_ffffffffffff" };
  writeFileSync(join(store.rootDir, "humans", `${human.human_id}.json`), JSON.stringify(swapped));
  assert.throws(() => store.humans.get(human.human_id), /binding mismatch/);
  assert.throws(() => store.humans.list(), /binding mismatch/);
});

test("store rejects unsafe ids and schema-invalid records", () => {
  const store = makeTempStore();
  assert.throws(() => store.humans.get("../evil"), /unsafe id/);
  const bad = sampleHuman({ human_id: "hum_UPPERCASE" }); // violates ^hum_[a-z0-9]{12}$
  assert.throws(() => store.humans.save(bad));
  const extra = sampleHuman() as unknown as Record<string, unknown>;
  extra.phones = "sneaky"; // .strict() must reject undeclared fields
  assert.throws(() => store.humans.save(extra as unknown as Parameters<typeof store.humans.save>[0]));
});

test("claims are stored per project and replaced by claim_id", () => {
  const store = makeTempStore();
  const claim = {
    claim_id: "clm_aaaaaaaaaa",
    project_id: "prj_test",
    dimension: "PRODUCT" as const,
    statement: "Our app is live on devnet",
    url: "https://example.com/app",
    proposed_findings: ["TESTNET_WORKING" as const],
    status: "UNVERIFIED" as const,
    verified_at: null,
    verifier: null,
    verify_note: null,
    created_at: T,
  };
  store.saveClaim("prj_test", claim);
  store.saveClaim("prj_test", { ...claim, claim_id: "clm_bbbbbbbbbb" });
  store.saveClaim("prj_test", { ...claim, statement: "updated" }); // same id replaces
  const claims = store.getClaims("prj_test");
  assert.equal(claims.length, 2);
  assert.equal(claims.find((c) => c.claim_id === "clm_aaaaaaaaaa")?.statement, "updated");
  assert.deepEqual(store.getClaims("prj_other"), []);
});
