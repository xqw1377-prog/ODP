import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  claimIx,
  claimReceiptPda,
} from "@odp/distribution-engine";
import { demoTree } from "./demo-data.js";
import type { DemoState } from "./demo-data.js";

/**
 * Demo-wallet claim executor (P0-5 §10/§12). The Maya keypair NEVER leaves
 * the local demo server — the browser only receives signatures and results.
 * This is demo infrastructure, not a production wallet model.
 */

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function loadMayaKeypair(): Keypair {
  const file = path.join(REPO, ".odp", "devnet-keys", "maya.json");
  const bytes = JSON.parse(readFileSync(file, "utf8")) as number[];
  return Keypair.fromSecretKey(new Uint8Array(bytes));
}

export interface ClaimResult {
  signature: string;
  explorer: string;
  receipt_pda: string;
  maya_balance: string;
}

/** Executes Maya's claim against the CURRENT demo distribution. Real devnet tx. */
export async function executeMayaClaim(state: DemoState): Promise<ClaimResult> {
  const connection = new Connection(state.rpc, "confirmed");
  const maya = loadMayaKeypair();
  const programId = new PublicKey(state.program_id);
  const distribution = new PublicKey(state.distribution_pda);
  const vault = new PublicKey(state.vault);
  const mint = new PublicKey(state.mint);
  const mayaAta = getAssociatedTokenAddressSync(mint, maya.publicKey);
  const receipt = claimReceiptPda({ programId }, distribution, maya.publicKey);

  const tree = demoTree(state);
  const { ix } = claimIx(
    { programId },
    maya.publicKey,
    mayaAta,
    distribution,
    vault,
    state.distribution_id,
    tree.maya.amount,
    tree.maya.proof,
  );

  // transient-skew retry only; protocol rejections propagate as failures
  let signature: string;
  for (let attempt = 1; ; attempt++) {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: maya.publicKey }).add(ix);
      signature = await sendAndConfirmTransaction(connection, tx, [maya]);
      break;
    } catch (err) {
      if (attempt < 5 && /Blockhash not found/i.test(String(err))) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }

  const receiptAccount = await connection.getAccountInfo(receipt);
  const balance = await connection.getTokenAccountBalance(mayaAta);

  return {
    signature,
    explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    receipt_pda: receipt.toBase58(),
    maya_balance: balance.value.amount,
  };
}

/** Current claim status for the UI (no signing). */
export async function readMayaClaimStatus(state: DemoState): Promise<{
  claimed: boolean;
  maya_balance: string;
  receipt_pda: string;
  distribution_live: boolean;
}> {
  const connection = new Connection(state.rpc, "confirmed");
  const maya = loadMayaKeypair();
  const programId = new PublicKey(state.program_id);
  const distribution = new PublicKey(state.distribution_pda);
  const mint = new PublicKey(state.mint);
  const mayaAta = getAssociatedTokenAddressSync(mint, maya.publicKey);
  const receipt = claimReceiptPda({ programId }, distribution, maya.publicKey);

  const [receiptAccount, distributionAccount, balanceInfo] = await Promise.all([
    connection.getAccountInfo(receipt),
    connection.getAccountInfo(distribution),
    connection.getTokenAccountBalance(mayaAta).catch(() => null),
  ]);
  // DistributionAccount layout: status is the final byte (see localnet-e2e)
  const live = distributionAccount !== null && distributionAccount.data[distributionAccount.data.length - 1] === 3;

  return {
    claimed: receiptAccount !== null,
    maya_balance: balanceInfo ? balanceInfo.value.amount : "0",
    receipt_pda: receipt.toBase58(),
    distribution_live: live,
  };
}
