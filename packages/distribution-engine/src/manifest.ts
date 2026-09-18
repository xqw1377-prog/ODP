import { createHash } from "node:crypto";
import { z } from "zod";
import { ISOString, PositiveU64String } from "@odp/domain";

const HEX64 = z.string().regex(/^[0-9a-f]{64}$/, { message: "expected 64-char lowercase hex" });

/**
 * Deterministic serialization: object keys sorted recursively, arrays keep
 * order, no whitespace. The same logical value always yields the same bytes
 * regardless of how the JS object was constructed.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

/** SHA-256 over canonical JSON bytes, lowercase hex. */
export function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/**
 * Canonical off-chain record binding ONE on-chain distribution to the exact
 * Passport + MatchIntent + Allocation snapshot it was built from.
 * manifest_hash = SHA256(canonicalJson(manifest)) is committed on-chain.
 */
export const DistributionManifestSchema = z
  .object({
    distribution_id: z.string().min(1),
    project_id: z.string().min(1),
    token_mint: z.string().min(1),
    total_amount: PositiveU64String,
    total_recipients: z.number().int().min(1),
    passport_hash: HEX64,
    match_intent_hash: HEX64,
    allocation_root: HEX64,
    created_at: ISOString,
  })
  .strict();
export type DistributionManifest = z.infer<typeof DistributionManifestSchema>;

export interface ManifestInput {
  distribution_id: string;
  project_id: string;
  token_mint: string;
  total_amount: string;
  total_recipients: number;
  passport: object;
  matchIntent: object;
  allocation_root: string;
  created_at: string;
}

export function buildManifest(input: ManifestInput): DistributionManifest {
  return DistributionManifestSchema.parse({
    distribution_id: input.distribution_id,
    project_id: input.project_id,
    token_mint: input.token_mint,
    total_amount: input.total_amount,
    total_recipients: input.total_recipients,
    passport_hash: hashCanonical(input.passport),
    match_intent_hash: hashCanonical(input.matchIntent),
    allocation_root: input.allocation_root,
    created_at: input.created_at,
  });
}

export function manifestHash(manifest: DistributionManifest): string {
  return hashCanonical(manifest);
}
