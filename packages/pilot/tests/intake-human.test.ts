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
});

test("PROOF: a form mistake never burns a valid wallet signature", () => {
  const store = makeTempStore();
  const { pubkey, secretKey } = generateWalletKeys();
  const challenge = createChallenge(store, pubkey);
  const signature = signMessage(secretKey, challenge.message);

  // first attempt: signature would be valid, but the form has a bad tag
  const failed = registerHuman(store, {
    wallet: pubkey, nonce: challenge.nonce, signature,
    x_handle: "@alice", interests: ["defi", "deffi"], consent_accepted: true,
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.match(failed.reason, /deffi/);
  // the nonce is still unconsumed
  assert.equal(store.challenges.get(challenge.nonce)?.consumed_at, null);

  // second attempt: same nonce, same signature — now it succeeds
  const retry = registerHuman(store, {
    wallet: pubkey, nonce: challenge.nonce, signature,
    x_handle: "@alice", interests: ["defi"], consent_accepted: true,
  });
  assert.equal(retry.ok, true);
  // and only now is the challenge consumed
  assert.notEqual(store.challenges.get(challenge.nonce)?.consumed_at, null);
});

test("duplicate wallet AND duplicate X handle cannot double-enter the pool", () => {
  const store = makeTempStore();
  const first = enrollHuman(store, { handle: "@alice", interests: ["solana"] });

  // same wallet, new handle → rejected
  const c1 = createChallenge(store, first.wallet);
  const sameWallet = registerHuman(store, {
    wallet: first.wallet, nonce: c1.nonce, signature: signMessage(first.keys.secretKey, c1.message),
    x_handle: "@bob", interests: ["solana"], consent_accepted: true,
  });
  assert.equal(sameWallet.ok, false);
  if (!sameWallet.ok) assert.match(sameWallet.reason, /wallet is already enrolled/);

  // same X handle (case-insensitive), different wallet → rejected
  const otherKeys = generateWalletKeys();
  const c3 = createChallenge(store, otherKeys.pubkey);
  const sameHandle = registerHuman(store, {
    wallet: otherKeys.pubkey, nonce: c3.nonce, signature: signMessage(otherKeys.secretKey, c3.message),
    x_handle: "@ALICE", interests: ["solana"], consent_accepted: true,
  });
  assert.equal(sameHandle.ok, false);
  if (!sameHandle.ok) assert.match(sameHandle.reason, /X handle is already enrolled/);

  assert.equal(eligiblePool(store).length, 1);
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

test("match pool = REAL + ELIGIBLE only; FIXTURE and disqualified humans are excluded", () => {
  const store = makeTempStore();
  enrollHuman(store, { handle: "@one" });
  enrollHuman(store, { handle: "@two" });
  store.humans.save(sampleHuman({ source: "FIXTURE", human_id: "hum_fixture00001" })); // never counts
  const disabled = sampleHuman({ status: "DISABLED" }); // qualification revoked
  store.humans.save(disabled);

  const pool = eligiblePool(store);
  assert.equal(pool.length, 2);
  // real count = every REAL human regardless of qualification (2 ELIGIBLE + 1 DISABLED); FIXTURE excluded
  assert.equal(realHumanCount(store), 3);
  assert.ok(pool.every((p) => p.human_id !== disabled.human_id));
});
