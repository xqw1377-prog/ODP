import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { base58Decode, base58Encode } from "./base58.js";
import { newNonce } from "./ids.js";
import type { PilotStore } from "./store.js";

/* D1-R: a real human proves wallet OWNERSHIP by signing a one-time,
   expiring challenge with their own wallet (Phantom / Solflare via the
   window.solana provider standard). ODP never sees or stores a private key.
   Nonces are single-use and consumed on successful verification. */

export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const CONSENT_POLICY_VERSION = "pilot-v0-2026-09";

export interface IssuedChallenge {
  nonce: string;
  message: string;
  expires_at: string;
}

export function createChallenge(store: PilotStore, wallet: string, at = new Date()): IssuedChallenge {
  new PublicKey(wallet); // throws unless valid base58 ed25519 pubkey
  const nonce = newNonce();
  const expires_at = new Date(at.getTime() + CHALLENGE_TTL_MS).toISOString();
  const message = [
    "ODP pilot enrollment",
    `wallet: ${wallet}`,
    `nonce: ${nonce}`,
    `expires: ${expires_at}`,
    `policy: ${CONSENT_POLICY_VERSION}`,
    "",
    "Signing proves you control this wallet. No transaction is created and no fee is charged.",
  ].join("\n");
  store.challenges.save({
    nonce,
    wallet,
    message,
    expires_at,
    consumed_at: null,
    created_at: at.toISOString(),
  });
  return { nonce, message, expires_at };
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyEnrollmentSignature(
  store: PilotStore,
  input: { nonce: string; wallet: string; signature: string },
  at = new Date(),
): VerifyResult {
  const challenge = store.challenges.get(input.nonce);
  if (challenge === null) return { ok: false, reason: "unknown or already-used challenge" };
  if (challenge.consumed_at !== null) return { ok: false, reason: "challenge already used" };
  if (Date.parse(challenge.expires_at) < at.getTime()) return { ok: false, reason: "challenge expired" };
  if (challenge.wallet !== input.wallet) return { ok: false, reason: "wallet does not match challenge" };

  let ok: boolean;
  try {
    ok = nacl.sign.detached.verify(
      new TextEncoder().encode(challenge.message),
      base58Decode(input.signature),
      base58Decode(input.wallet),
    );
  } catch {
    ok = false;
  }
  if (!ok) return { ok: false, reason: "signature verification failed" };

  store.challenges.save({ ...challenge, consumed_at: at.toISOString() }); // single use
  return { ok: true };
}

/** sha256 helper used by run ids / dedup checks (kept tiny). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function signatureToBase58(sig: Uint8Array): string {
  return base58Encode(sig);
}
