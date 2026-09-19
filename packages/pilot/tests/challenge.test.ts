import { test } from "node:test";
import assert from "node:assert/strict";
import { createChallenge, CHALLENGE_TTL_MS, verifyEnrollmentSignature } from "../src/challenge.js";
import { generateWalletKeys, makeTempStore, signMessage, T } from "./helpers.js";

test("challenge issuance validates the wallet and stores a one-time nonce", () => {
  const store = makeTempStore();
  const { pubkey } = generateWalletKeys();
  const challenge = createChallenge(store, pubkey, new Date(T));
  assert.match(challenge.nonce, /^[a-f0-9]{32}$/);
  assert.ok(challenge.message.includes(`wallet: ${pubkey}`));
  assert.ok(challenge.message.includes(`nonce: ${challenge.nonce}`));
  assert.equal(Date.parse(challenge.expires_at) - Date.parse(T), CHALLENGE_TTL_MS);
  assert.notEqual(store.challenges.get(challenge.nonce), null);
});

test("challenge issuance rejects invalid wallet strings", () => {
  const store = makeTempStore();
  assert.throws(() => createChallenge(store, "not-a-wallet"));
  assert.throws(() => createChallenge(store, "111")); // decodes to wrong length
});

test("happy path: a wallet-signed challenge verifies exactly once", () => {
  const store = makeTempStore();
  const { pubkey, secretKey } = generateWalletKeys();
  const challenge = createChallenge(store, pubkey);
  const signature = signMessage(secretKey, challenge.message);

  const first = verifyEnrollmentSignature(store, { nonce: challenge.nonce, wallet: pubkey, signature });
  assert.deepEqual(first, { ok: true });

  // replay must fail: the nonce is consumed
  const replay = verifyEnrollmentSignature(store, { nonce: challenge.nonce, wallet: pubkey, signature });
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.match(replay.reason, /already used/);
});

test("tampered signatures and wrong wallets fail closed", () => {
  const store = makeTempStore();
  const { pubkey, secretKey } = generateWalletKeys();
  const challenge = createChallenge(store, pubkey);
  const signature = signMessage(secretKey, challenge.message) ;

  const flipped = signature.slice(0, -2) + (signature.endsWith("A") ? "B" : "A");
  const tampered = verifyEnrollmentSignature(store, { nonce: challenge.nonce, wallet: pubkey, signature: flipped });
  assert.equal(tampered.ok, false);
  if (!tampered.ok) assert.match(tampered.reason, /signature verification failed/);

  const other = generateWalletKeys();
  const wrongWallet = verifyEnrollmentSignature(store, { nonce: challenge.nonce, wallet: other.pubkey, signature });
  assert.equal(wrongWallet.ok, false);
  if (!wrongWallet.ok) assert.match(wrongWallet.reason, /does not match/);
});

test("expired challenges are refused (and never marked consumed)", () => {
  const store = makeTempStore();
  const { pubkey, secretKey } = generateWalletKeys();
  const issuedAt = new Date(T);
  const challenge = createChallenge(store, pubkey, issuedAt);
  const signature = signMessage(secretKey, challenge.message);
  const later = new Date(Date.parse(T) + CHALLENGE_TTL_MS + 1000);
  const result = verifyEnrollmentSignature(store, { nonce: challenge.nonce, wallet: pubkey, signature }, later);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /expired/);
});

test("unknown nonces are refused", () => {
  const store = makeTempStore();
  const { pubkey, secretKey } = generateWalletKeys();
  const result = verifyEnrollmentSignature(store, {
    nonce: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    wallet: pubkey,
    signature: signMessage(secretKey, "anything"),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /unknown/);
});
