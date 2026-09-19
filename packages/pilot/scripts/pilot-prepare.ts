import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
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
import {
  DISTRIBUTOR_PROGRAM_ID,
  distributionPda as deriveDistributionPda,
  initializeDistributionIx,
  fundDistributionIx,
  commitRootIx,
  openClaimsIx,
  buildManifest,
  manifestHash,
} from "@odp/distribution-engine";
import { PilotStore } from "../src/store.js";
import { toMatchIntent } from "../src/intake-project.js";

/* P1-C gate 6 — generic devnet prepare: ANY project × ANY explicit recipient
   count. Same on-chain recipe as the frozen demo-prepare (which is left
   untouched), parameterized by the pilot run record. Recipients bring their
   OWN wallets; the project authority keypair is the only key loaded here.

   AUTHORITY DISCIPLINE (P1-C-R1): PILOT-0 may use our own dedicated devnet
   pilot authority. PILOT-1 with an external project requires the project to
   run prepare/sign itself, or a dedicated devnet authority created for the
   pilot — a project's production wallet private key must NEVER be handed to
   ODP. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const RUN_ID = arg("run");
const RPC = arg("rpc") ?? process.env.ODP_PILOT_RPC ?? "https://api.devnet.solana.com";
const PROJECT_KEY = arg("project-key") ?? path.join(REPO, ".odp", "pilot", "project-key.json");

if (!RUN_ID) {
  console.error("usage: npm run pilot:prepare -- --run run_<id> [--rpc url] [--project-key path]");
  process.exit(1);
}

const store = new PilotStore();
const run = store.runs.get(RUN_ID);
if (run === null) throw new Error(`run ${RUN_ID} not found`);
if (run.status !== "DRY" || run.onchain !== null) throw new Error(`run ${RUN_ID} is ${run.status} — only DRY runs can be prepared`);
const project = store.projects.get(run.project_id);
if (project === null) throw new Error(`project ${run.project_id} not found`);
const detail = store.engine.getProjectPassport(run.project_id);
if (detail === null || detail.passport.status !== "ALLOW") throw new Error("project passport is not ALLOW");

// the project authority keypair is the only key on this path (operator-held)
const keyBytes = JSON.parse(readFileSync(PROJECT_KEY, "utf8")) as number[];
const authority = Keypair.fromSecretKey(new Uint8Array(keyBytes));
if (authority.publicKey.toBase58() !== project.wallet)
  throw new Error(`project key mismatch: key is ${authority.publicKey.toBase58()}, intake wallet is ${project.wallet}`);

const connection = new Connection(RPC, "confirmed");

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

const total = BigInt(run.total_amount);
const createdAt = new Date().toISOString();
console.log(`preparing run ${run.run_id} — ${run.recipient_count} recipients, total ${total}`);
console.log(`authority: ${authority.publicKey.toBase58()} (${project.name})`);

// 1. fresh pilot mint (decimals = 0)
const mintKeypair = Keypair.generate();
{
  const lamports = await connection.getMinimumBalanceForRentExemption(82);
  const createMint = SystemProgram.createAccount({
    fromPubkey: authority.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    space: 82,
    lamports,
    programId: TOKEN_PROGRAM_ID,
  });
  createMint.keys[1]!.isSigner = true; // agave 3+: new account signs its creation
  const initMint = createInitializeMintInstruction(mintKeypair.publicKey, 0, authority.publicKey, authority.publicKey);
  console.log(`  mint created (${await sendCombo([createMint, initMint], [authority, mintKeypair])})`);
}
const mint = mintKeypair.publicKey;

// 2. on-chain accounts (identical derivation to the frozen demo path)
const distributionPda = deriveDistributionPda({
  authority: authority.publicKey,
  distributionId: run.distribution_id,
  programId: DISTRIBUTOR_PROGRAM_ID,
});
const vault = getAssociatedTokenAddressSync(mint, distributionPda, true);
const projectAta = (await getOrCreateAssociatedTokenAccount(connection, authority, mint, authority.publicKey)).address;
await mintTo(connection, authority, mint, projectAta, authority, total);

// 3. recipient ATAs + gas fan-out (recipients pay their own claim fees later)
for (const a of run.allocations) {
  await getOrCreateAssociatedTokenAccount(connection, authority, mint, new PublicKey(a.wallet));
  const bal = await connection.getBalance(new PublicKey(a.wallet));
  if (bal < 0.02 * LAMPORTS_PER_SOL) {
    const ix = SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: new PublicKey(a.wallet),
      lamports: 0.05 * LAMPORTS_PER_SOL,
    });
    console.log(`  gas fan-out -> ${a.human_id} (${await send(ix, [authority])})`);
  }
}

// 4. manifest rebuilt with the REAL mint over the exact run allocations
const passportDetail = store.engine.getProjectPassport(run.project_id)!;
const manifest = buildManifest({
  distribution_id: run.distribution_id,
  project_id: project.project_id,
  token_mint: mint.toBase58(),
  total_amount: run.total_amount,
  total_recipients: run.recipient_count,
  passport: passportDetail.passport,
  matchIntent: toMatchIntent(project),
  allocation_root: run.root,
  created_at: createdAt,
});
const mHash = manifestHash(manifest);

const ADDR = {
  programId: DISTRIBUTOR_PROGRAM_ID,
  authority: authority.publicKey,
  mint,
  distributionPda,
  vault,
  authorityToken: projectAta,
  distributionId: run.distribution_id,
  projectId: project.project_id,
  total,
};

const txs: Record<string, string> = {};
txs.initialize = await send(initializeDistributionIx(ADDR), [authority]);
console.log(`  initialize: ${txs.initialize}`);
txs.fund = await send(fundDistributionIx(ADDR), [authority]);
console.log(`  fund: ${txs.fund}`);
txs.commit = await send(commitRootIx(ADDR, Buffer.from(run.root, "hex"), Buffer.from(mHash, "hex"), run.allocations.length), [authority]);
console.log(`  commit_root: ${txs.commit}`);
txs.open = await send(openClaimsIx(ADDR), [authority]);
console.log(`  open_claims: ${txs.open}`);

store.runs.save({
  ...run,
  status: "LIVE",
  token_mint: mint.toBase58(),
  // LIVE semantics: manifest_hash is now the hash actually committed on-chain
  // (rebuilt with the real mint), and committed_manifest_hash records that
  // fact explicitly so the evidence ledger matches chain state 1:1.
  manifest_hash: mHash,
  committed_manifest_hash: mHash,
  onchain: {
    network: RPC.includes("devnet") ? "devnet" : "custom",
    rpc: RPC,
    program_id: DISTRIBUTOR_PROGRAM_ID.toBase58(),
    mint: mint.toBase58(),
    distribution_pda: distributionPda.toBase58(),
    vault: vault.toBase58(),
    txs,
    prepared_at: createdAt,
  },
});

console.log("");
console.log("LIVE ✅");
console.log(`  distribution: ${distributionPda.toBase58()}`);
console.log(`  vault:        ${vault.toBase58()}`);
console.log(`  mint:         ${mint.toBase58()}`);
console.log(`  root:         ${run.root}`);
console.log(`  manifest:     ${mHash}`);
console.log(`  recipients:   ${run.allocations.length}`);
