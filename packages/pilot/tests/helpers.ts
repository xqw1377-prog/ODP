import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nacl from "tweetnacl";
import { base58Encode } from "../src/base58.js";
import { createChallenge, CONSENT_POLICY_VERSION } from "../src/challenge.js";
import { registerHuman } from "../src/intake-human.js";
import { newHumanId } from "../src/ids.js";
import { computeHumanConfidence, noEvidenceScore } from "../src/provenance.js";
import { PilotStore } from "../src/store.js";
import type { PilotHuman } from "../src/schema.js";

export const T = "2026-09-19T00:00:00Z";

export function makeTempStore(): PilotStore {
  return new PilotStore(mkdtempSync(join(tmpdir(), "odp-pilot-test-")));
}

export function sampleHuman(overrides: Partial<PilotHuman> = {}): PilotHuman {
  return {
    human_id: newHumanId(),
    source: "REAL",
    wallet: "7NpStwe8SSnzvYK1waN8JaeTZ7yq1XsSt5yQ5hRPSibD",
    wallet_verified_at: T,
    x_handle: "@tester",
    x_identity_status: "SELF_DECLARED",
    interests: ["solana", "depin"],
    consent: { accepted_at: T, policy_version: CONSENT_POLICY_VERSION },
    scores: {
      human_confidence: computeHumanConfidence({ wallet_verified: true, x_identity_status: "SELF_DECLARED" }, T),
      reputation: noEvidenceScore("reputation", T),
      network_score: noEvidenceScore("network_score", T),
    },
    status: "ELIGIBLE",
    created_at: T,
    ...overrides,
  };
}

export interface WalletKeys {
  pubkey: string;
  secretKey: Uint8Array;
}

export function generateWalletKeys(): WalletKeys {
  const kp = nacl.sign.keyPair();
  return { pubkey: base58Encode(kp.publicKey), secretKey: kp.secretKey };
}

export function signMessage(secretKey: Uint8Array, message: string): string {
  return base58Encode(nacl.sign.detached(new TextEncoder().encode(message), secretKey));
}

/** Full D1-R enrollment: challenge → wallet signature → verified ELIGIBLE human. */
export function enrollHuman(
  store: PilotStore,
  opts: { handle?: string; interests?: string[]; keys?: WalletKeys } = {},
): PilotHuman & { keys: WalletKeys } {
  const keys = opts.keys ?? generateWalletKeys();
  const challenge = createChallenge(store, keys.pubkey);
  const result = registerHuman(store, {
    wallet: keys.pubkey,
    nonce: challenge.nonce,
    signature: signMessage(keys.secretKey, challenge.message),
    x_handle: opts.handle ?? "@tester",
    interests: opts.interests ?? ["solana"],
    consent_accepted: true,
  });
  if (!result.ok) throw new Error(`enrollHuman helper failed: ${result.reason}`);
  return { ...result.human, keys };
}
