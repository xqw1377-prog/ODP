import { test } from "node:test";
import assert from "node:assert/strict";
import { createChallenge } from "../src/challenge.js";
import { eligiblePool, realHumanCount, registerHuman, toHumanProfile } from "../src/intake-human.js";
import { enrollHuman, generateWalletKeys, makeTempStore, sampleHuman, signMessage } from "./helpers.js";

test("happy path: real wallet → challenge → signed → verified → consented → ELIGIBLE", () => {
  const store = makeTempStore();
  const human = enrollHuman(store, { handle: "@maya_dev", interests: ["solana", "depin"] });
  assert.match(human.human_id, /^hum_[a-z0-9]{12}$/);
  assert.equal(human.source, "REAL");
  assert.equal(human.status, "ELIGIBLE");
  assert.equal(human.x_handle, "@maya_dev");
  assert.equal(human.x_identity_status, "SELF_DECLARED");
  assert.deepEqual(human.interests, ["solana", "depin"]);
  assert.equal(human.scores.human_confidence.value, 0.5); // wallet verified + self-declared handle
  assert.equal(human.scores.reputation.value, 0);
  assert.equal(human.scores.network_score.value, 0);
  assert.equal(human.consent.policy_version, "pilot-v0-2026-09");
  // challenge was consumed — the nonce cannot mint a second human
  const reuse = registerHuman(store, {
    wallet: human.wallet,
    nonce: store.challenges.list()[0]!.nonce,
    signature: "2NEpo7tZRZ6nGdgqVHDU8DL8rnV4YKmbFkkXXGNLB6hbUMaU2ftZ4uECL7fMjYj8Z1s4ePFnbMvTmUP56C2SjfPFy",
    x_handle: "@again",
    interests: ["solana"],
    consent_accepted: true,
  });
  assert.equal(reuse.ok, false);
});

test("intake fails closed without consent, with bad handles, or with out-of-vocabulary tags", () => {
  const store = makeTempStore();

  // consent is checked before the challenge is consumed
  const { pubkey: k1, secretKey: s1 } = generateWalletKeys();
  const c1 = createChallenge(store, k1);
  const noConsent = registerHuman(store, {
    wallet: k1, nonce: c1.nonce, signature: signMessage(s1, c1.message),
    x_handle: "@a", interests: ["solana"], consent_accepted: false,
  });
  assert.equal(noConsent.ok, false);
  if (!noConsent.ok) assert.match(noConsent.reason, /consent/);

  // bad handle: challenge verifies and is consumed, human is rejected
  const { pubkey: k2, secretKey: s2 } = generateWalletKeys();
  const c2 = createChallenge(store, k2);
  const badHandle = registerHuman(store, {
    wallet: k2, nonce: c2.nonce, signature: signMessage(s2, c2.message),
    x_handle: "not a handle!", interests: ["solana"], consent_accepted: true,
  });
  assert.equal(badHandle.ok, false);
  if (!badHandle.ok) assert.match(badHandle.reason, /x_handle/);

  // unknown tags: fresh challenge, rejected on vocabulary
  const { pubkey: k3, secretKey: s3 } = generateWalletKeys();
  const c3 = createChallenge(store, k3);
  const unknownTags = registerHuman(store, {
    wallet: k3, nonce: c3.nonce, signature: signMessage(s3, c3.message),
    x_handle: "@a", interests: ["defi", "deffi"], consent_accepted: true,
  });
  assert.equal(unknownTags.ok, false);
  if (!unknownTags.ok) assert.match(unknownTags.reason, /deffi/);
});

test("duplicate wallet enrollment is rejected", () => {
  const store = makeTempStore();
  const enrolled = enrollHuman(store);
  // fresh challenge, same wallet → ownership proves fine, but the wallet is taken
  const { pubkey, secretKey } = generateWalletKeys();
  void pubkey; void secretKey;
  const challenge = createChallenge(store, enrolled.wallet);
  const second = registerHuman(store, {
    wallet: enrolled.wallet,
    nonce: challenge.nonce,
    signature: signMessage(enrolled.keys.secretKey, challenge.message),
    x_handle: "@impersonator",
    interests: ["solana"],
    consent_accepted: true,
  });
  assert.equal(second.ok, false);
  if (!second.ok) assert.match(second.reason, /already enrolled/);
});

test("toHumanProfile emits a frozen-schema-valid HumanProfile with provenance values", () => {
  const store = makeTempStore();
  const human = enrollHuman(store, { interests: ["solana", "ai"] });
  const profile = toHumanProfile(human);
  assert.equal(profile.human_id, human.human_id);
  assert.equal(profile.x_id, "@tester");
  assert.equal(profile.wallet, human.wallet);
  assert.equal(profile.human_confidence, 0.5);
  assert.equal(profile.reputation, 0);
  assert.equal(profile.network_score, 0);
  assert.deepEqual(profile.interest_tags, ["solana", "ai"]);
  assert.deepEqual(profile.risk_flags, []);
});

test("match pool = REAL + ELIGIBLE only; FIXTURE humans and progressed humans are excluded", () => {
  const store = makeTempStore();
  enrollHuman(store, { handle: "@one" });
  enrollHuman(store, { handle: "@two" });
  store.humans.save(sampleHuman({ source: "FIXTURE", human_id: "hum_fixture00001" })); // never counts
  const matched = sampleHuman({ status: "MATCHED" });
  store.humans.save(matched); // progressed past ELIGIBLE

  const pool = eligiblePool(store);
  assert.equal(pool.length, 2);
  // real count = every REAL human regardless of progress (2 ELIGIBLE + 1 MATCHED); FIXTURE excluded
  assert.equal(realHumanCount(store), 3);
  assert.ok(pool.every((p) => p.human_id !== matched.human_id));
});
