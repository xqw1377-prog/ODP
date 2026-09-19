import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { claimIx, DISTRIBUTOR_PROGRAM_ID } from "@odp/distribution-engine";
import { base58Decode, base58Encode } from "./base58.js";
import type { PilotHuman, PilotRun } from "./schema.js";
import type { PilotStore } from "./store.js";

/* Self-custody claim (D1-R): the backend builds the frozen claim instruction
   and serializes an UNSIGNED transaction. The human's own wallet (Phantom /
   Solflare) adds the required signature and submits it. The server never
   holds a human private key — not for enrollment, not for claiming. */

export type Claimable =
  | { ok: true; human: PilotHuman; allocation: { human_id: string; wallet: string; amount: string } }
  | { ok: false; reason: string };

export function assertClaimable(store: PilotStore, run: PilotRun, wallet: string): Claimable {
  if (run.onchain === null) return { ok: false, reason: "this run is not prepared on devnet yet" };
  if (run.status !== "LIVE") return { ok: false, reason: `run status is ${run.status} — claims are not open` };

  const allocation = run.allocations.find((a) => a.wallet === wallet);
  if (allocation === undefined) return { ok: false, reason: "no allocation exists for this wallet" };

  const human = store.humans.get(allocation.human_id);
  if (human === null) return { ok: false, reason: "allocation references an unknown human" };
  if (human.source !== "REAL") return { ok: false, reason: "only real humans claim through this flow" };
  if (run.claims[human.human_id] !== undefined)
    return { ok: false, reason: "this allocation was already claimed" };

  return { ok: true, human, allocation };
}

export interface BuiltClaimTx {
  transaction: string; // base64, unsigned except feePayer/claimant declared
  message: string; // human-readable summary for the confirm dialog
  receipt_pda: string;
  amount: string;
}

/** Pure builder — no network. The blockhash is fetched by the caller so this
    stays unit-testable offline. */
export function buildClaimTransaction(input: {
  run: PilotRun;
  wallet: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
}): BuiltClaimTx {
  const { run, wallet } = input;
  if (run.onchain === null) throw new Error("run is not prepared on devnet");
  const allocation = run.allocations.find((a) => a.wallet === wallet);
  if (allocation === undefined) throw new Error("no allocation exists for this wallet");

  const claimant = new PublicKey(wallet);
  const mint = new PublicKey(run.onchain.mint);
  const distribution = new PublicKey(run.onchain.distribution_pda);
  const vault = new PublicKey(run.onchain.vault);
  const claimantAta = getAssociatedTokenAddressSync(mint, claimant);

  const { ix, receiptPda } = claimIx(
    { programId: new PublicKey(run.onchain.program_id) },
    claimant,
    claimantAta,
    distribution,
    vault,
    run.distribution_id,
    BigInt(allocation.amount),
    run.proofs[wallet]!.map((p) => Buffer.from(base58Decode(p))),
  );

  // feePayer = claimant = first (and only) required signer — explicit, and the
  // signature that releases funds comes from the human's own wallet.
  const tx = new Transaction({
    feePayer: claimant,
    blockhash: input.recentBlockhash,
    lastValidBlockHeight: input.lastValidBlockHeight,
  }).add(ix);

  return {
    transaction: tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    message: `Claim ${allocation.amount} pilot tokens from ${run.distribution_id}? You are the fee payer. One signature, no approvals.`,
    receipt_pda: base58Encode(receiptPda.toBytes()),
    amount: allocation.amount,
  };
}

/** Convenience for the server route: fetch a fresh blockhash (transient skew
    is an RPC operational matter; protocol rejections are never retried). */
export async function fetchBlockhash(rpc: string): Promise<{ recentBlockhash: string; lastValidBlockHeight: number }> {
  const connection = new Connection(rpc, "confirmed");
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  return { recentBlockhash: blockhash, lastValidBlockHeight };
}

/** Guard used by tests to build a deterministic offline blockhash. */
export function offlineBlockhash(seed = "odp-pilot-offline-blockhash-seed"): { recentBlockhash: string; lastValidBlockHeight: number } {
  return {
    recentBlockhash: base58Encode(Keypair.fromSeed(new Uint8Array(new TextEncoder().encode(seed).slice(0, 32))).publicKey.toBytes()),
    lastValidBlockHeight: 42,
  };
}

/** Record a confirmed self-custody claim into the run ledger and progress the
    human. Called only after the signature is observed on-chain (server route). */
export function recordClaim(
  store: PilotStore,
  run: PilotRun,
  human_id: string,
  proof: { claim_tx: string; receipt_pda: string },
  at = new Date(),
): void {
  const claimed = run.claims[human_id];
  if (claimed !== undefined) throw new Error("run ledger already records this claim");
  store.runs.save({
    ...run,
    claims: {
      ...run.claims,
      [human_id]: { claim_tx: proof.claim_tx, receipt_pda: proof.receipt_pda, claimed_at: at.toISOString() },
    },
  });
  const human = store.humans.get(human_id);
  if (human !== null) store.humans.save({ ...human, status: "CLAIMED" });
}

export const PROGRAM_ID = DISTRIBUTOR_PROGRAM_ID;
