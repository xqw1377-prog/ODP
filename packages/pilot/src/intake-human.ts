import { HumanProfileSchema, type HumanProfile } from "@odp/domain";
import { CONSENT_POLICY_VERSION, verifyEnrollmentSignature } from "./challenge.js";
import { newHumanId } from "./ids.js";
import { computeHumanConfidence, noEvidenceScore } from "./provenance.js";
import type { PilotHuman } from "./schema.js";
import type { PilotStore } from "./store.js";
import { unknownTags } from "./vocabulary.js";

/* D1-R: real humans bring their OWN wallet and prove ownership by signing a
   one-time challenge. ODP stores the pubkey only. A human becomes ELIGIBLE
   (i.e. matchable) only with wallet verification + explicit consent.

   Validation order (P1-A review fix B): every STATIC check runs first and the
   challenge is verified + consumed LAST, so a valid wallet signature is never
   burned by a form mistake. Duplicate checks (P1-A review fix A) reject both
   duplicate wallets AND duplicate X handles — one human, one pool entry. */

export interface HumanIntakeInput {
  wallet: string;
  nonce: string;
  signature: string;
  x_handle: string;
  interests: string[];
  consent_accepted: boolean;
  at?: Date;
}

export type IntakeResult = { ok: true; human: PilotHuman } | { ok: false; reason: string };

const HANDLE_RE = /^@?([A-Za-z0-9_]{1,15})$/;

export function normalizeHandle(raw: string): string | null {
  const m = HANDLE_RE.exec(raw.trim());
  return m === null ? null : `@${m[1]!}`;
}

export function registerHuman(store: PilotStore, input: HumanIntakeInput): IntakeResult {
  const at = input.at ?? new Date();

  // ── 1. static validation — nothing is consumed yet ────────────────────
  if (input.consent_accepted !== true) return { ok: false, reason: "consent to be matched is required" };

  const handle = normalizeHandle(input.x_handle);
  if (handle === null) return { ok: false, reason: "x_handle must look like @name (1-15 letters/digits/underscore)" };

  if (!Array.isArray(input.interests) || input.interests.length < 1)
    return { ok: false, reason: "pick at least one interest" };
  const unknown = unknownTags(input.interests);
  if (unknown.length > 0) return { ok: false, reason: `unknown interests: ${unknown.join(", ")}` };

  // ── 2. duplicate guards (REAL humans only; fixtures are separate infra) ─
  const existing = store.humans.list().filter((h) => h.source === "REAL");
  if (existing.some((h) => h.wallet === input.wallet))
    return { ok: false, reason: "this wallet is already enrolled" };
  if (existing.some((h) => h.x_handle.toLowerCase() === handle.toLowerCase()))
    return { ok: false, reason: "this X handle is already enrolled — one human, one pool entry" };

  // ── 3. challenge verification + consumption (LAST, after all static checks)
  const verify = verifyEnrollmentSignature(store, { nonce: input.nonce, wallet: input.wallet, signature: input.signature }, at);
  if (!verify.ok) return { ok: false, reason: verify.reason };

  // ── 4. build + save ────────────────────────────────────────────────────
  const record: PilotHuman = {
    human_id: newHumanId(),
    source: "REAL",
    wallet: input.wallet,
    wallet_verified_at: at.toISOString(),
    x_handle: handle,
    x_identity_status: "SELF_DECLARED",
    interests: [...new Set(input.interests)],
    consent: { accepted_at: at.toISOString(), policy_version: CONSENT_POLICY_VERSION },
    scores: {
      human_confidence: computeHumanConfidence({ wallet_verified: true, x_identity_status: "SELF_DECLARED" }, at.toISOString()),
      reputation: noEvidenceScore("reputation", at.toISOString()),
      network_score: noEvidenceScore("network_score", at.toISOString()),
    },
    status: "ELIGIBLE",
    created_at: at.toISOString(),
  };
  while (store.humans.get(record.human_id) !== null) record.human_id = newHumanId();
  store.humans.save(record);
  return { ok: true, human: record };
}

/** The frozen matcher consumes exactly this shape; values come from provenance. */
export function toHumanProfile(h: PilotHuman): HumanProfile {
  return HumanProfileSchema.parse({
    human_id: h.human_id,
    x_id: h.x_handle,
    wallet: h.wallet,
    human_confidence: h.scores.human_confidence.value,
    reputation: h.scores.reputation.value,
    network_score: h.scores.network_score.value,
    interest_tags: h.interests,
    risk_flags: [],
  });
}

/** Match pool: REAL, consented, wallet-verified humans only. */
export function eligiblePool(store: PilotStore): HumanProfile[] {
  return store.humans
    .list()
    .filter((h) => h.source === "REAL" && h.status === "ELIGIBLE")
    .map(toHumanProfile);
}

/** FIXTURE humans are test infrastructure and are excluded from every count. */
export function realHumanCount(store: PilotStore): number {
  return store.humans.list().filter((h) => h.source === "REAL").length;
}
