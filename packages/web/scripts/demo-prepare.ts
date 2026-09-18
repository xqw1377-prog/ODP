import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  DISTRIBUTOR_PROGRAM_ID,
  distributionPda as deriveDistributionPda,
  initializeDistributionIx,
  fundDistributionIx,
  commitRootIx,
  openClaimsIx,
} from "@odp/distribution-engine";
import { computeDemoSnapshot, computeManifestHash, demoTree } from "../src/demo-data.js";

/**
 * P0-5 demo prepare (§11): takes a FRESH distribution all the way to
 * READY TO CLAIM and stops. Maya is NOT claimed — the on-stage click is the
 * real claim. Writes .odp/demo-state.json (gitignored).
 */

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const RPC = process.env.ODP_LOCALNET_RPC ?? "https://api.devnet.solana.com";

function loadKeypair(name: string): Keypair {
  const file = path.join(REPO, ".odp", "devnet-keys", `${name}.json`);
  const bytes = JSON.parse(readFileSync(file, "utf8")) as number[];
  return Keypair.fromSecretKey(new Uint8Array(bytes));
}

const connection = new Connection(RPC, "confirmed");

/** transient devnet skew retry (operational only — protocol rejections are NOT retried into success) */
async function sendCombo(ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: signers[0]!.publicKey });
      for (const ix of ixs) tx.add(ix);
      return await sendAndConfirmTransaction(connection, tx, signers);
    } catch (err) {
      if (attempt < 5 && /Blockhash not found/i.test(String(err))) {
        console.log(`  (retry ${attempt}: transient devnet blockhash skew)`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
}

async function send(ix: TransactionInstruction, signers: Keypair[]): Promise<string> {
  return sendCombo([ix], signers);
}

async function main() {
  const project = loadKeypair("project");
  const balance = await connection.getBalance(project.publicKey);
  console.log(`project wallet: ${project.publicKey.toBase58()} = ${balance / 1e9} SOL`);
  if (balance < 0.05 * 1e9) throw new Error("project wallet underfunded for demo prepare");

  // ensure humans have SOL for on-stage claim fees + receipt rent
  for (const name of ["maya", "dan", "sib"]) {
    const kp = loadKeypair(name);
    const bal = await connection.getBalance(kp.publicKey);
    if (bal < 0.02 * 1e9) {
      const { SystemProgram } = await import("@solana/web3.js");
      const ix = SystemProgram.transfer({
        fromPubkey: project.publicKey,
        toPubkey: kp.publicKey,
        lamports: 0.05 * 1e9,
      });
      const sig = await send(ix, [project]);
      console.log(`  fan-out ${name}: ${sig}`);
    }
  }

  const distributionId = `dst_aurora_demo_${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
  const createdAt = new Date().toISOString();
  console.log(`fresh distribution_id: ${distributionId}`);

  // 1. demo mint (decimals = 0)
  const mintKeypair = Keypair.generate();
  {
    const { SystemProgram } = await import("@solana/web3.js");
    const lamports = await connection.getMinimumBalanceForRentExemption(82);
    const createMint = SystemProgram.createAccount({
      fromPubkey: project.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: 82,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    });
    createMint.keys[1]!.isSigner = true; // agave 3+: new account signs its creation
    const initMint = createInitializeMintInstruction(mintKeypair.publicKey, 0, project.publicKey, project.publicKey);
    const sig = await sendCombo([createMint, initMint], [project, mintKeypair]);
    console.log(`  mint created (${sig})`);
  }
  const mint = mintKeypair.publicKey;

  // 2. real off-chain snapshot
  const snapshot = computeDemoSnapshot();
  const allocations = snapshot.allocations; // maya 5000 / dan 5000, derived
  const total = allocations.reduce((acc, a) => acc + BigInt(a.amount), 0n);

  // 3. on-chain lifecycle
  const distributionPda = deriveDistributionPda({
    authority: project.publicKey,
    distributionId,
    programId: DISTRIBUTOR_PROGRAM_ID,
  });
  const vault = getAssociatedTokenAddressSync(mint, distributionPda, true);
  const projectAta = (await getOrCreateAssociatedTokenAccount(connection, project, mint, project.publicKey)).address;
  await mintTo(connection, project, mint, projectAta, project, total);
  // claimant ATAs must exist before the on-stage claim (no fake readiness)
  await getOrCreateAssociatedTokenAccount(connection, project, mint, loadKeypair("maya").publicKey);
  await getOrCreateAssociatedTokenAccount(connection, project, mint, loadKeypair("dan").publicKey);

  // real amounts FIRST — the committed tree must be built over the actual
  // allocations (maya 5000 / dan 5000), or claims verify against a wrong root
  const mayaAmount = allocations.find((a) => a.human_id === "hum_maya")!.amount;
  const danAmount = allocations.find((a) => a.human_id === "hum_dev_dan")!.amount;

  const tree = demoTree({
    distribution_id: distributionId,
    created_at: createdAt,
    network: "devnet",
    rpc: RPC,
    program_id: DISTRIBUTOR_PROGRAM_ID.toBase58(),
    project_authority: project.publicKey.toBase58(),
    mint: mint.toBase58(),
    distribution_pda: distributionPda.toBase58(),
    vault: vault.toBase58(),
    root: "",
    manifest_hash: "",
    total: total.toString(),
    maya_amount: mayaAmount,
    dan_amount: danAmount,
    transactions: {},
  });
  const root = tree.root;

  const ADDR = {
    programId: DISTRIBUTOR_PROGRAM_ID,
    authority: project.publicKey,
    mint,
    distributionPda,
    vault,
    authorityToken: projectAta,
    distributionId,
    projectId: "prj_aurora_net",
    total,
  };

  const txs: Record<string, string> = {};
  txs.initialize = await send(initializeDistributionIx(ADDR), [project]);
  console.log(`  initialize: ${txs.initialize}`);
  txs.fund = await send(fundDistributionIx(ADDR), [project]);
  console.log(`  fund: ${txs.fund}`);

  const manifestHash = computeManifestHash({
    distributionId,
    mint: mint.toBase58(),
    root,
    total: total.toString(),
    createdAt,
  });
  txs.commit = await send(commitRootIx(ADDR, Buffer.from(root, "hex"), Buffer.from(manifestHash, "hex"), allocations.length), [project]);
  console.log(`  commit_root: ${txs.commit}`);
  txs.open = await send(openClaimsIx(ADDR), [project]);
  console.log(`  open_claims: ${txs.open}`);

  const state = {
    distribution_id: distributionId,
    created_at: createdAt,
    network: "devnet",
    rpc: RPC,
    program_id: DISTRIBUTOR_PROGRAM_ID.toBase58(),
    project_authority: project.publicKey.toBase58(),
    mint: mint.toBase58(),
    distribution_pda: distributionPda.toBase58(),
    vault: vault.toBase58(),
    root,
    manifest_hash: manifestHash,
    total: total.toString(),
    maya_amount: mayaAmount,
    dan_amount: danAmount,
    transactions: txs,
  };
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(path.join(REPO, ".odp"), { recursive: true });
  writeFileSync(path.join(REPO, ".odp", "demo-state.json"), JSON.stringify(state, null, 2) + "\n");
  console.log("");
  console.log("READY TO CLAIM ✅");
  console.log(`  distribution: ${distributionPda.toBase58()}`);
  console.log(`  vault:        ${vault.toBase58()}`);
  console.log(`  mint:         ${mint.toBase58()}`);
  console.log(`  root:         ${root}`);
  console.log(`  manifest:     ${manifestHash}`);
  console.log(`  maya: ${mayaAmount}  dan: ${danAmount}`);
  console.log("state written: .odp/demo-state.json");
}

// keep hash import referenced for root derivation clarity
void createHash;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
