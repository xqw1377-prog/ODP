import { z } from "zod";
import { ISOString } from "./util.js";

// ── Passport-level status ──────────────────────────────────────────────

export const PassportStatusSchema = z.enum(["ALLOW", "WATCH", "REJECT"]);
export type PassportStatus = z.infer<typeof PassportStatusSchema>;

/** Statuses a passport can transition FROM, including its pre-ruling origin. */
export const PassportNodeSchema = z.enum(["DISCOVERED", "ALLOW", "WATCH", "REJECT"]);
export type PassportNode = z.infer<typeof PassportNodeSchema>;

// ── Per-dimension status vocabularies ──────────────────────────────────

export const TeamStatusSchema = z.enum([
  "VERIFIED",
  "PARTIAL",
  "UNVERIFIED",
  "CAUTION",
  "MALICIOUS",
]);
export const ProductStatusSchema = z.enum([
  "MISSING",
  "IDEA",
  "DEMO",
  "TESTNET",
  "LIVE",
  "REVENUE",
]);
export const CodeStatusSchema = z.enum(["NONE", "UNVERIFIED", "STALE", "ACTIVE", "AUDITED"]);
export const TokenStatusSchema = z.enum(["HEALTHY", "CAUTION", "MALICIOUS"]);
export const OnchainStatusSchema = z.enum(["HEALTHY", "WATCH", "ABNORMAL", "MALICIOUS"]);
export const SocialStatusSchema = z.enum(["ORGANIC", "MIXED", "BOT_HEAVY", "FAKE"]);

export const PASSPORT_DIMENSIONS = ["TEAM", "PRODUCT", "CODE", "TOKEN", "ONCHAIN", "SOCIAL"] as const;
export type PassportDimension = (typeof PASSPORT_DIMENSIONS)[number];

// ── Evidence ───────────────────────────────────────────────────────────

export const EvidenceSchema = z.object({
  source: z.string().min(1),
  detail: z.string().min(1),
  url: z.string().url().nullable().default(null),
  at: ISOString,
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// ── Dimensions ─────────────────────────────────────────────────────────

function dimension<S extends z.ZodTypeAny>(status: S) {
  return z.object({
    status,
    evidence: z.array(EvidenceSchema).default([]),
    warnings: z.array(z.string().min(1)).default([]),
    unknowns: z.array(z.string().min(1)).default([]),
    updated_at: ISOString,
  });
}

export const TeamDimSchema = dimension(TeamStatusSchema);
export const ProductDimSchema = dimension(ProductStatusSchema);
export const CodeDimSchema = dimension(CodeStatusSchema);
export const TokenDimSchema = dimension(TokenStatusSchema);
export const OnchainDimSchema = dimension(OnchainStatusSchema);
export const SocialDimSchema = dimension(SocialStatusSchema);

export type TeamDim = z.infer<typeof TeamDimSchema>;
export type ProductDim = z.infer<typeof ProductDimSchema>;
export type CodeDim = z.infer<typeof CodeDimSchema>;
export type TokenDim = z.infer<typeof TokenDimSchema>;
export type OnchainDim = z.infer<typeof OnchainDimSchema>;
export type SocialDim = z.infer<typeof SocialDimSchema>;

export type PassportDims = {
  TEAM: TeamDim;
  PRODUCT: ProductDim;
  CODE: CodeDim;
  TOKEN: TokenDim;
  ONCHAIN: OnchainDim;
  SOCIAL: SocialDim;
};

// ── Status history ─────────────────────────────────────────────────────

export const StatusEventSchema = z.object({
  from: PassportNodeSchema,
  to: PassportNodeSchema,
  reason: z.string().min(1),
  at: ISOString,
});
export type StatusEvent = z.infer<typeof StatusEventSchema>;

// ── Passport ───────────────────────────────────────────────────────────

/**
 * Six-dimension, evidence-based, continuously audited project record.
 * `reasons` always explains the current `status` — never a black box.
 */
export const ProjectPassportSchema = z.object({
  project_id: z.string().min(1),
  dims: z.object({
    TEAM: TeamDimSchema,
    PRODUCT: ProductDimSchema,
    CODE: CodeDimSchema,
    TOKEN: TokenDimSchema,
    ONCHAIN: OnchainDimSchema,
    SOCIAL: SocialDimSchema,
  }),
  status: PassportStatusSchema,
  reasons: z.array(z.string().min(1)),
  status_history: z.array(StatusEventSchema).default([]),
  updated_at: ISOString,
});
export type ProjectPassport = z.infer<typeof ProjectPassportSchema>;
