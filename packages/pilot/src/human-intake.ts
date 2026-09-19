import { z } from "zod";
import { HumanProfileSchema } from "@odp/domain";
import type { HumanProfile } from "@odp/domain";
import { humanIdFromHandle, normalizeXHandle } from "./ids.js";
import { normalizeTag } from "./tags.js";
import { assertSolanaPubkey } from "./wallet.js";

/**
 * Conservative V0 scores for stub-X opt-in humans.
 * Matching still uses MATCH_WEIGHTS in matching-engine — these are intake
 * defaults, not a formula change. Stub X is unverified.
 */
export const EARLY_HUMAN_V0_STUB_SCORES = {
  human_confidence: 0.45,
  reputation: 0.2,
  network_score: 0.2,
} as const;

export const SLOGAN = "Stop hunting. Get discovered.";

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
  })
  .strict();
export type HumanConsentRecord = z.infer<typeof HumanConsentRecordSchema>;

export interface HumanIntakeResult {
  profile: HumanProfile;
  consent: HumanConsentRecord;
}

/**
 * Persistable Early Humans V0 input → frozen HumanProfile.
 * Consent is enforced here; it cannot be stored on HumanProfile (strict G1).
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
    ...EARLY_HUMAN_V0_STUB_SCORES,
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
  });

  return { profile, consent };
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
