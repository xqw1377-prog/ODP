import { z } from "zod";
import { HumanProfileSchema } from "@odp/domain";
import type { HumanProfile } from "@odp/domain";
import { humanIdFromHandle, normalizeXHandle } from "./ids.js";
import { normalizeTag } from "./tags.js";
import { assertSolanaPubkey } from "./wallet.js";

/**
 * V0 does not compute reputation or network. HumanProfile requires the
 * numeric fields (frozen G1), so they are stored as zero = unscored.
 * Matching still uses MATCH_WEIGHTS; these are not invented ratings.
 */
export const EARLY_HUMAN_V0_UNSCORED = {
  human_confidence: 0,
  reputation: 0,
  network_score: 0,
} as const;

/** @deprecated alias — same unscored zeros; do not treat as measured scores */
export const EARLY_HUMAN_V0_STUB_SCORES = EARLY_HUMAN_V0_UNSCORED;

export const SLOGAN = "Stop hunting. Get discovered.";
export const LANDING_SUB =
  "Connect your X and Solana wallet. Tell ODP what you care about. Qualified crypto projects can find you when there's a real match.";

export const FUNNEL_STAGES = [
  "DISCOVERED",
  "INVITED",
  "LANDING",
  "X_CONNECTED",
  "WALLET_BOUND",
  "CONSENTED",
  "INTERESTS_COMPLETED",
  "ELIGIBLE_HUMAN",
  "MATCHED",
  "CLAIMED",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const REVIEW_FLAGS = ["MULTI_WALLET", "MULTI_X"] as const;
export type ReviewFlag = (typeof REVIEW_FLAGS)[number];

export const POOL_SEED_TARGET = 30;
export const POOL_STRETCH_HOLD = 1000;
export const POOL_COMPOSITION_TARGET = {
  builders: 10,
  depin_node: 8,
  infra: 5,
  early_adopters: 4,
  founders: 3,
} as const;

export interface XIdentitySource {
  readonly kind: "stub" | "x_oauth";
  connect(input: { handle?: string }): { x_id: string; verified: boolean };
}

/** V0: explicit placeholder handle + opt-in. Real OAuth is a drop-in later. */
export class StubXIdentitySource implements XIdentitySource {
  readonly kind = "stub" as const;

  connect(input: { handle?: string }): { x_id: string; verified: boolean } {
    if (input.handle === undefined || input.handle.trim().length === 0) {
      throw new Error("stub X requires an explicit placeholder handle (upgrade path: real OAuth)");
    }
    return { x_id: normalizeXHandle(input.handle), verified: false };
  }
}

export function resolveXIdentitySource(): XIdentitySource {
  const mode = process.env.ODP_HUMAN_SOURCE ?? "fixture";
  if (mode === "x_oauth") {
    throw new Error("X OAuth is reserved (ODP_HUMAN_SOURCE=x_oauth) but not implemented in Early Humans V0 — use the stub handle + consent path");
  }
  return new StubXIdentitySource();
}

export const HumanIntakeSchema = z
  .object({
    x_handle: z.string().min(1),
    wallet: z.string().min(1),
    interest_tags: z.array(z.string().min(1)).min(3).max(5),
    /** Required: this is a stub X connection, not OAuth. */
    x_stub_acknowledged: z.literal(true),
    /** Required: explicit opt-in to be discovered by matching. */
    consent: z.literal(true),
    human_id: z.string().min(1).optional(),
  })
  .strict();
export type HumanIntake = z.infer<typeof HumanIntakeSchema>;

export const HumanConsentRecordSchema = z
  .object({
    human_id: z.string().min(1),
    opted_in: z.literal(true),
    opted_in_at: z.string().min(1),
    x_source: z.enum(["stub", "x_oauth"]),
    x_stub_acknowledged: z.literal(true),
    slogan: z.literal(SLOGAN),
    funnel_stage: z.enum(FUNNEL_STAGES),
    review_flags: z.array(z.enum(REVIEW_FLAGS)).default([]),
  })
  .strict();
export type HumanConsentRecord = z.infer<typeof HumanConsentRecordSchema>;

export interface HumanIntakeResult {
  profile: HumanProfile;
  consent: HumanConsentRecord;
}

export function isEligibleConsent(consent: HumanConsentRecord): boolean {
  return consent.opted_in === true && consent.funnel_stage === "ELIGIBLE_HUMAN" && consent.review_flags.length === 0;
}

/**
 * Persistable Early Humans V0 input → frozen HumanProfile.
 * Consent / funnel live in the sidecar (HumanProfile is strict G1).
 * Tags are user-selected only. Reputation is not computed.
 */
export function intakeHuman(input: unknown, source: XIdentitySource = resolveXIdentitySource()): HumanIntakeResult {
  const body = HumanIntakeSchema.parse(input);
  if (source.kind === "stub" && body.x_stub_acknowledged !== true) {
    throw new Error("stub X requires explicit x_stub_acknowledged consent");
  }

  const connected = source.connect({ handle: body.x_handle });
  const tags = unique(body.interest_tags.map(normalizeTag));
  if (tags.length < 3 || tags.length > 5) {
    throw new Error("choose 3–5 unique interest tags from the Early Humans V0 catalog");
  }

  const human_id = body.human_id ?? humanIdFromHandle(connected.x_id);
  const profile = HumanProfileSchema.parse({
    human_id,
    x_id: connected.x_id,
    wallet: assertSolanaPubkey(body.wallet),
    ...EARLY_HUMAN_V0_UNSCORED,
    interest_tags: tags,
    risk_flags: [],
  });

  const consent = HumanConsentRecordSchema.parse({
    human_id: profile.human_id,
    opted_in: true,
    opted_in_at: new Date().toISOString(),
    x_source: source.kind,
    x_stub_acknowledged: true,
    slogan: SLOGAN,
    funnel_stage: "ELIGIBLE_HUMAN",
    review_flags: [],
  });

  return { profile, consent };
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
