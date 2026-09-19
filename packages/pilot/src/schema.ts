import { z } from "zod";
import { ISOString, PositiveU64String } from "@odp/domain";
import { FindingKindSchema } from "@odp/passport-engine";
import { ScoreProvenanceSchema } from "./provenance.js";

/* Pilot sidecar records. These exist because the frozen .strict() domain
   schemas deliberately have no room for consent, provenance, wallets-of-
   projects or free-text intent. Everything here is PRIVATE runtime data under
   .odp/pilot/ (gitignored). Nothing in this file touches engine schemas. */

// ── humans ──────────────────────────────────────────────────────────────

/* Qualification-only status: a human is a network node, not a one-shot
   coupon. Match/allocate/claim progress lives in the Project×Human×Run
   ledger (PilotRun), never on the human itself. */
export const HumanStatusSchema = z.enum(["ELIGIBLE", "REVIEW", "DISABLED"]);
export type HumanStatus = z.infer<typeof HumanStatusSchema>;

export const XIdentityStatusSchema = z.enum(["SELF_DECLARED"]); // "X_VERIFIED" reserved for real OAuth
export type XIdentityStatus = z.infer<typeof XIdentityStatusSchema>;

export const PilotHumanSchema = z.strictObject({
  human_id: z.string().regex(/^hum_[a-z0-9]{12}$/),
  source: z.enum(["REAL", "FIXTURE"]), // FIXTURE humans never count as real evidence
  wallet: z.string().min(1), // base58 pubkey; ownership proven by signed challenge (REAL)
  wallet_verified_at: ISOString,
  x_handle: z.string().min(1),
  x_identity_status: XIdentityStatusSchema,
  interests: z.array(z.string().min(1)).min(1),
  consent: z.strictObject({ accepted_at: ISOString, policy_version: z.string().min(1) }),
  scores: z.strictObject({
    human_confidence: ScoreProvenanceSchema,
    reputation: ScoreProvenanceSchema,
    network_score: ScoreProvenanceSchema,
  }),
  status: HumanStatusSchema,
  created_at: ISOString,
});
export type PilotHuman = z.infer<typeof PilotHumanSchema>;

// ── projects ────────────────────────────────────────────────────────────

export const ProjectStatusSchema = z.enum(["SUBMITTED", "PASSPORT_GENERATED"]);

export const PilotProjectSchema = z.strictObject({
  project_id: z.string().regex(/^prj_[a-z0-9][a-z0-9_-]{0,31}$/),
  name: z.string().min(1),
  symbol: z.string().min(1),
  website: z.string().url(),
  x_account: z.string().min(1),
  github: z.string().url().nullable(),
  chain: z.string().min(1),
  token_address: z.string().min(1).nullable(),
  // sidecar-only fields (no room in the frozen candidate schema, by design):
  wallet: z.string().min(1), // project Solana wallet (fee payer / authority)
  intent_text: z.string().min(1),
  discovery_source: z.enum(["social", "onchain", "developer", "capital", "network"]),
  target_tags: z.array(z.string().min(1)).min(1),
  created_at: ISOString,
  status: ProjectStatusSchema,
});
export type PilotProject = z.infer<typeof PilotProjectSchema>;

// ── evidence candidates (D5-R: never enter a passport while UNVERIFIED) ──

export const DimensionSchema = z.enum(["TEAM", "PRODUCT", "CODE", "TOKEN", "ONCHAIN", "SOCIAL"]);
export type Dimension = z.infer<typeof DimensionSchema>;

export const EvidenceClaimSchema = z.strictObject({
  claim_id: z.string().regex(/^clm_[a-z0-9]{10}$/),
  project_id: z.string().min(1),
  dimension: DimensionSchema,
  statement: z.string().min(1),
  url: z.string().url().nullable(),
  proposed_findings: z.array(FindingKindSchema).min(1),
  status: z.enum(["UNVERIFIED", "VERIFIED", "REJECTED"]),
  verified_at: ISOString.nullable(),
  verifier: z.string().nullable(),
  verify_note: z.string().nullable(),
  created_at: ISOString,
});
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;

export const ClaimFileSchema = z.strictObject({
  project_id: z.string().min(1),
  claims: z.array(EvidenceClaimSchema),
});
export type ClaimFile = z.infer<typeof ClaimFileSchema>;

// ── run records (private: wallets live here, aggregates go public) ───────

export const RunStatusSchema = z.enum(["DRY", "PREPARED", "LIVE", "DONE"]);

export const RunAllocationSchema = z.strictObject({
  human_id: z.string().min(1),
  wallet: z.string().min(1),
  amount: PositiveU64String,
});

export const PilotRunSchema = z.strictObject({
  run_id: z.string().regex(/^run_[a-z0-9_-]{1,48}$/),
  project_id: z.string().min(1),
  distribution_id: z.string().min(1),
  token_mint: z.string().min(1).nullable(), // null until devnet prepare creates it
  total_amount: PositiveU64String,
  recipient_count: z.number().int().min(1),
  status: RunStatusSchema,
  passport_status: z.literal("ALLOW"),
  matches: z.array(z.strictObject({ human_id: z.string(), score: z.number() })),
  allocations: z.array(RunAllocationSchema),
  root: z.string().regex(/^[0-9a-f]{64}$/),
  manifest_hash: z.string().regex(/^[0-9a-f]{64}$/),
  /* Once the run is LIVE, manifest_hash carries the hash actually committed
     on-chain (rebuilt with the real mint). committed_manifest_hash records
     that same on-chain fact explicitly for the evidence ledger; while DRY it
     is null and manifest_hash is the placeholder-mint hash. */
  committed_manifest_hash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  // merkle proofs per wallet (array of base58-encoded proof buffers), private
  proofs: z.record(z.string(), z.array(z.string())),
  onchain: z
    .strictObject({
      network: z.string().min(1),
      rpc: z.string().min(1),
      program_id: z.string().min(1),
      mint: z.string().min(1),
      distribution_pda: z.string().min(1),
      vault: z.string().min(1),
      txs: z.strictObject({
        initialize: z.string().min(1),
        fund: z.string().min(1),
        commit: z.string().min(1),
        open: z.string().min(1),
      }),
      prepared_at: ISOString,
    })
    .nullable(),
  claims: z.record(
    z.string(),
    z.strictObject({ claim_tx: z.string().min(1), receipt_pda: z.string().min(1), claimed_at: ISOString }),
  ),
  feedback: z.array(
    z.strictObject({
      human_id: z.string().min(1),
      score: z.number().int().min(1).max(5),
      text: z.string().min(1),
      at: ISOString,
    }),
  ),
  created_at: ISOString,
});
export type PilotRun = z.infer<typeof PilotRunSchema>;

// ── enrollment challenges (one-time, expiring) ──────────────────────────

export const ChallengeSchema = z.strictObject({
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
  wallet: z.string().min(1),
  message: z.string().min(1),
  expires_at: ISOString,
  consumed_at: ISOString.nullable(),
  created_at: ISOString,
});
export type Challenge = z.infer<typeof ChallengeSchema>;
