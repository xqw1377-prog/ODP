import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createHash } from "node:crypto";
import { SystemProgram } from "@solana/web3.js";

/**
 * Raw anchor instruction builders for the distributor program (P0-4).
 * Shared by the devnet evidence script AND the offline signability
 * regression — the test exercises exactly the builders that ship.
 */

export const DISTRIBUTOR_PROGRAM_ID = new PublicKey(
  "GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW",
);

export interface DistributionAddresses {
  programId: PublicKey;
  /** project authority (funds, commits, opens) */
  authority: PublicKey;
  mint: PublicKey;
  distributionPda: PublicKey;
  vault: PublicKey;
  authorityToken: PublicKey;
  distributionId: string;
  projectId: string;
  total: bigint;
}

const sha256 = (data: Buffer | string): Buffer => createHash("sha256").update(data).digest();

export function distributionIdHash(distributionId: string): Buffer {
  return sha256(distributionId);
}

export function distributionPda(a: Pick<DistributionAddresses, "authority" | "distributionId" | "programId">): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("distribution"),
      a.authority.toBuffer(),
      distributionIdHash(a.distributionId),
    ],
    a.programId,
  )[0];
}

export function claimReceiptPda(
  a: Pick<DistributionAddresses, "programId">,
  distribution: PublicKey,
  claimant: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), distribution.toBuffer(), claimant.toBuffer()],
    a.programId,
  )[0];
}

const ixDiscriminator = (name: string): Buffer => sha256(`global:${name}`).subarray(0, 8);
const u64le = (n: bigint): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const u32le = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const borshString = (s: string): Buffer => Buffer.concat([u32le(s.length), Buffer.from(s, "utf8")]);

export function initializeDistributionIx(a: DistributionAddresses): TransactionInstruction {
  const data = Buffer.concat([
    ixDiscriminator("initialize_distribution"),
    distributionIdHash(a.distributionId),
    sha256(a.projectId),
    u64le(a.total),
  ]);
  return new TransactionInstruction({
    programId: a.programId,
    keys: [
      { pubkey: a.authority, isSigner: true, isWritable: true },
      { pubkey: a.mint, isSigner: false, isWritable: false },
      { pubkey: a.distributionPda, isSigner: false, isWritable: true },
      { pubkey: a.vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function fundDistributionIx(a: DistributionAddresses): TransactionInstruction {
  return new TransactionInstruction({
    programId: a.programId,
    keys: [
      { pubkey: a.authority, isSigner: true, isWritable: true },
      { pubkey: a.distributionPda, isSigner: false, isWritable: true },
      { pubkey: a.authorityToken, isSigner: false, isWritable: true },
      { pubkey: a.vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: ixDiscriminator("fund_distribution"),
  });
}

export function commitRootIx(
  a: DistributionAddresses,
  root: Buffer,
  manifestHash: Buffer,
  recipients: number,
): TransactionInstruction {
  const data = Buffer.concat([
    ixDiscriminator("commit_root"),
    root,
    manifestHash,
    u32le(recipients),
  ]);
  return new TransactionInstruction({
    programId: a.programId,
    keys: [
      { pubkey: a.authority, isSigner: true, isWritable: true },
      { pubkey: a.distributionPda, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function openClaimsIx(a: DistributionAddresses): TransactionInstruction {
  return new TransactionInstruction({
    programId: a.programId,
    keys: [
      { pubkey: a.authority, isSigner: true, isWritable: true },
      { pubkey: a.distributionPda, isSigner: false, isWritable: true },
      { pubkey: a.vault, isSigner: false, isWritable: false },
    ],
    data: ixDiscriminator("open_claims"),
  });
}

export interface ClaimIx {
  ix: TransactionInstruction;
  receiptPda: PublicKey;
}

export function claimIx(
  a: Pick<DistributionAddresses, "programId">,
  claimant: PublicKey,
  claimantAta: PublicKey,
  distribution: PublicKey,
  vault: PublicKey,
  distributionId: string,
  amount: bigint,
  proof: Buffer[],
): ClaimIx {
  const receiptPda = claimReceiptPda(a, distribution, claimant);
  const data = Buffer.concat([
    ixDiscriminator("claim"),
    borshString(distributionId),
    u64le(amount),
    u32le(proof.length),
    Buffer.concat(proof),
  ]);
  const ix = new TransactionInstruction({
    programId: a.programId,
    keys: [
      { pubkey: claimant, isSigner: true, isWritable: true },
      { pubkey: distribution, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: claimantAta, isSigner: false, isWritable: true },
      { pubkey: receiptPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  return { ix, receiptPda };
}

/**
 * Signed-transaction assembly for EXPECTED-TO-FAIL transactions.
 * Frozen rule (P0-4B-R1): fee payer = first required signer, set
 * EXPLICITLY — no reliance on library-implicit selection. Must never throw
 * "unknown signer": every keypair passed must be an instruction signer.
 */
export function assembleSigned(
  ix: TransactionInstruction,
  signers: Keypair[],
  recentBlockhash: string,
  lastValidBlockHeight = 0,
): Transaction {
  const tx = new Transaction({
    recentBlockhash,
    feePayer: signers[0]!.publicKey,
  });
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.add(ix);
  tx.sign(...signers);
  return tx;
}
