import { z } from "zod";
import { ISOString, PositiveU64String } from "./util.js";

// ── Status & events ────────────────────────────────────────────────────

export const DistributionStatusSchema = z.enum([
  "PENDING_DEPOSIT",
  "DEPOSITED",
  "COMMITTED",
  "LIVE",
  "CLOSED",
]);
export type DistributionStatus = z.infer<typeof DistributionStatusSchema>;

export type DistributionEvent =
  | { type: "DEPOSIT_CONFIRMED"; vault: string; deposit_tx: string; at?: string }
  | { type: "ROOT_COMMITTED"; allocation_root: string; total_recipients: number; at?: string }
  | { type: "CLAIMS_OPENED"; at?: string }
  | { type: "CLOSED"; at?: string };

// ── Distribution ───────────────────────────────────────────────────────

const HEX64 = z.string().regex(/^[0-9a-f]{64}$/, { message: "expected 64-char lowercase hex root" });

/**
 * On-chain-backed distribution record. Frozen contract (strict) with
 * cross-field state invariants — e.g. `LIVE + allocation_root=null` can
 * never parse. Amounts are canonical positive u64 strings.
 *
 * The project cannot mutate user allocations after the root is committed —
 * enforcement happens in the Solana program (P0-4); the state machine here
 * freezes the legal lifecycle.
 */
export const DistributionSchema = z
  .object({
    distribution_id: z.string().min(1),
    project_id: z.string().min(1),
    token_mint: z.string().min(1),
    vault: z.string().min(1).nullable(),
    allocation_root: HEX64.nullable(),
    total_amount: PositiveU64String,
    total_recipients: z.number().int().nonnegative(),
    status: DistributionStatusSchema,
    created_at: ISOString,
    deposit_tx: z.string().min(1).nullable(),
    committed_at: ISOString.nullable(),
    closed_at: ISOString.nullable(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });

    const requiresUnfundedShape = () => {
      if (d.allocation_root !== null) issue(`${d.status} requires allocation_root = null`);
      if (d.total_recipients !== 0) issue(`${d.status} requires total_recipients = 0`);
      if (d.committed_at !== null) issue(`${d.status} requires committed_at = null`);
      if (d.closed_at !== null) issue(`${d.status} requires closed_at = null`);
    };
    const requiresFundedFields = () => {
      if (d.vault === null) issue(`${d.status} requires a vault`);
      if (d.deposit_tx === null) issue(`${d.status} requires deposit_tx`);
      if (d.allocation_root === null) issue(`${d.status} requires allocation_root`);
      if (d.total_recipients < 1) issue(`${d.status} requires total_recipients >= 1`);
      if (d.committed_at === null) issue(`${d.status} requires committed_at`);
    };

    switch (d.status) {
      case "PENDING_DEPOSIT":
        if (d.vault !== null) issue("PENDING_DEPOSIT requires vault = null");
        if (d.deposit_tx !== null) issue("PENDING_DEPOSIT requires deposit_tx = null");
        requiresUnfundedShape();
        break;
      case "DEPOSITED":
        if (d.vault === null) issue("DEPOSITED requires a vault");
        if (d.deposit_tx === null) issue("DEPOSITED requires deposit_tx");
        requiresUnfundedShape();
        break;
      case "COMMITTED":
      case "LIVE":
        requiresFundedFields();
        if (d.closed_at !== null) issue(`${d.status} requires closed_at = null`);
        break;
      case "CLOSED":
        requiresFundedFields();
        if (d.closed_at === null) issue("CLOSED requires closed_at");
        break;
    }
  });
export type Distribution = z.infer<typeof DistributionSchema>;

export function createDistribution(
  distribution_id: string,
  project_id: string,
  token_mint: string,
  total_amount: string,
  at = new Date().toISOString(),
): Distribution {
  return DistributionSchema.parse({
    distribution_id,
    project_id,
    token_mint,
    vault: null,
    allocation_root: null,
    total_amount,
    total_recipients: 0,
    status: "PENDING_DEPOSIT",
    created_at: at,
    deposit_tx: null,
    committed_at: null,
    closed_at: null,
  });
}

/**
 * Event-driven state machine. Legal path (no skipping):
 *   PENDING_DEPOSIT → DEPOSITED → COMMITTED → LIVE → CLOSED
 * Illegal events throw — rules must be verifiable before distribution starts.
 */
export function applyDistributionEvent(d: Distribution, event: DistributionEvent): Distribution {
  const at = "at" in event && event.at !== undefined ? event.at : new Date().toISOString();

  switch (event.type) {
    case "DEPOSIT_CONFIRMED": {
      if (d.status !== "PENDING_DEPOSIT") {
        throw new Error(`DEPOSIT_CONFIRMED is only legal from PENDING_DEPOSIT (got ${d.status})`);
      }
      return DistributionSchema.parse({
        ...d,
        vault: event.vault,
        deposit_tx: event.deposit_tx,
        status: "DEPOSITED",
      });
    }
    case "ROOT_COMMITTED": {
      if (d.status !== "DEPOSITED") {
        throw new Error(`ROOT_COMMITTED is only legal from DEPOSITED (got ${d.status})`);
      }
      if (!Number.isInteger(event.total_recipients) || event.total_recipients < 1) {
        throw new Error("ROOT_COMMITTED requires total_recipients >= 1");
      }
      return DistributionSchema.parse({
        ...d,
        allocation_root: event.allocation_root,
        total_recipients: event.total_recipients,
        status: "COMMITTED",
        committed_at: at,
      });
    }
    case "CLAIMS_OPENED": {
      if (d.status !== "COMMITTED") {
        throw new Error(`CLAIMS_OPENED is only legal from COMMITTED (got ${d.status})`);
      }
      return DistributionSchema.parse({ ...d, status: "LIVE" });
    }
    case "CLOSED": {
      if (d.status !== "LIVE") {
        throw new Error(`CLOSED is only legal from LIVE (got ${d.status})`);
      }
      return DistributionSchema.parse({ ...d, status: "CLOSED", closed_at: at });
    }
  }
}

// ── Allocation ─────────────────────────────────────────────────────────

export const AllocationSchema = z
  .object({
    distribution_id: z.string().min(1),
    human_id: z.string().min(1),
    wallet: z.string().min(1),
    amount: PositiveU64String,
  })
  .strict();
export type Allocation = z.infer<typeof AllocationSchema>;

/** Σ allocation.amount must equal distribution.total_amount, else throw. */
export function assertAllocationConservation(total_amount: string, allocations: Allocation[]): void {
  const sum = allocations.reduce((acc, a) => acc + BigInt(a.amount), 0n);
  if (sum !== BigInt(total_amount)) {
    throw new Error(`allocation conservation violated: sum ${sum} != total ${total_amount}`);
  }
}
