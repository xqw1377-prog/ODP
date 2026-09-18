import { z } from "zod";
import { ISOString, U64String } from "./util.js";

const HEX64 = z.string().regex(/^[0-9a-f]{64}$/, { message: "expected 64-char lowercase hex root" });

/**
 * On-chain-anchored proof of one completed claim. `claim_tx` must resolve to
 * a Solana Explorer transaction (P0-6 wires the link; the contract is frozen now).
 */
export const DistributionReceiptSchema = z.object({
  project_id: z.string().min(1),
  distribution_id: z.string().min(1),
  wallet: z.string().min(1),
  amount: U64String,
  token_mint: z.string().min(1),
  claim_tx: z.string().min(1),
  claimed_at: ISOString,
  allocation_root: HEX64,
});
export type DistributionReceipt = z.infer<typeof DistributionReceiptSchema>;

/** Build + validate a receipt in one step — an invalid receipt cannot exist. */
export function buildReceipt(input: DistributionReceipt): DistributionReceipt {
  return DistributionReceiptSchema.parse(input);
}
