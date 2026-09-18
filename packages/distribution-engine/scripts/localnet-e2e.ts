import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allocationLeaf, buildMerkleTree, createDistribution, merkleProof } from "@odp/domain";
import {
  FixtureDiscoverySource,
  loadEvidenceBundles,
  generatePassport,
} from "@odp/passport-engine";
import { loadHumanProfiles, loadMatchIntent, matchProject } from "@odp/matching-engine";
import { buildAllocations, buildManifest, manifestHash } from "../src/index.js";

/**
 * P0-4 §21 local-validator matrix: the full on-chain Golden Path against a
 * locally running solana-test-validator with the distributor .so deployed.
 *
 *   1. start validator:  .odp-tools/solana-release/bin/solana-test-validator \
 *        --reset --ledger .odp/localnet-ledger \
 *        --bpf-program GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW \
 *          programs/distributor/target/deploy/distributor.so
 *   2. npm run localnet   (in packages/distribution-engine)
 */

const PROGRAM_ID = new PublicKey("GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW");
const RPC = process.env.ODP_LOCALNET_RPC ?? "http://127.0.0.1:8899";
const DISTRIBUTION_ID = "dst_aurora_demo_001";
const PROJECT_ID = "prj_aurora_net";
const TOTAL = 10_000n;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const KEYS = path.join(REPO, ".odp", "devnet-keys");
const PASSPORT_FIXTURES = path.resolve(HERE, "../../passport-engine/fixtures");
const MATCHING_FIXTURES = path.resolve(HERE, "../../matching-engine/fixtures");

function loadKeypair(name: string): Keypair {
  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(path.join(KEYS, `${name}.json`), "utf8")) as number[]),
  );
}

const sha256 = (data: Buffer | string): Buffer => createHash("sha256").update(data).digest();
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

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
async function expectTxFailure(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    ok(label, false, "transaction unexpectedly succeeded");
  } catch (err) {
    ok(label, true, String(err).split("\n")[0]!.slice(0, 140));
  }
}

// ── wait for validator ─────────────────────────────────────────────────
const connection = new Connection(RPC, "confirmed");
for (let i = 0; i < 30; i++) {
  try {
    await connection.getVersion();
    break;
  } catch {
    if (i === 29) throw new Error(`validator not reachable at ${RPC}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ── keypairs ───────────────────────────────────────────────────────────
const project = loadKeypair("project");
const maya = loadKeypair("maya");
const dan = loadKeypair("dan");
const sib = loadKeypair("sib");

// ── demo mint (decimals = 0, per the frozen P0 policy) ─────────────────
console.log("setup: mint + token accounts");
const mintKeypair = Keypair.generate();
{
  const lamports = await connection.getMinimumBalanceForRentExemption(82);
  const createMint = SystemProgram.createAccount({
    fromPubkey: project.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    space: 82,
    lamports,
    programId: TOKEN_PROGRAM_ID,
  });
  // agave 3+ runtimes require the new account to sign its own creation
  createMint.keys[1]!.isSigner = true;
  const tx = new Transaction().add(
    createMint,
    createInitializeMintInstruction(mintKeypair.publicKey, 0, project.publicKey, project.publicKey),
  );
  await sendAndConfirmTransaction(connection, tx, [project, mintKeypair]);
}
const MINT = mintKeypair.publicKey;

const projectAta = (await getOrCreateAssociatedTokenAccount(connection, project, MINT, project.publicKey)).address;
await mintTo(connection, project, MINT, projectAta, project, TOTAL);
const mayaAta = (await getOrCreateAssociatedTokenAccount(connection, project, MINT, maya.publicKey)).address;
const danAta = (await getOrCreateAssociatedTokenAccount(connection, project, MINT, dan.publicKey)).address;
const sibAta = (await getOrCreateAssociatedTokenAccount(connection, project, MINT, sib.publicKey)).address;

// ── the REAL off-chain pipeline: passport → matching → allocation ──────
const candidates = new FixtureDiscoverySource(path.join(PASSPORT_FIXTURES, "discovery")).discover();
const bundles = loadEvidenceBundles(path.join(PASSPORT_FIXTURES, "evidence"));
const auroraCandidate = candidates.find((c) => c.project_id === PROJECT_ID)!;
const auroraBundle = bundles.find((b) => b.project_id === PROJECT_ID)!;
const passport = generatePassport(auroraCandidate, auroraBundle);
const intent = loadMatchIntent(path.join(MATCHING_FIXTURES, "intents", "prj_aurora_net.intent.json"));
const humans = loadHumanProfiles(path.join(MATCHING_FIXTURES, "humans"));
const matches = matchProject({ passport, intent, humans });
const distribution = createDistribution(DISTRIBUTION_ID, PROJECT_ID, MINT.toBase58(), TOTAL.toString(), "2026-09-18T00:00:00Z");
const allocations = buildAllocations(distribution, matches, humans);
const leaves = allocations.map(allocationLeaf);
const tree = buildMerkleTree(leaves);
const rootHex = tree.root.toString("hex");
const manifest = buildManifest({
  distribution_id: distribution.distribution_id,
  project_id: PROJECT_ID,
  token_mint: MINT.toBase58(),
  total_amount: TOTAL.toString(),
  total_recipients: allocations.length,
  passport,
  matchIntent: intent,
  allocation_root: rootHex,
  created_at: "2026-09-18T00:00:00Z",
});
const manifestHashHex = manifestHash(manifest);
console.log(`off-chain: ${allocations.map((a) => `${a.human_id}:${a.amount}`).join(" ")} root=${rootHex}`);

// ── on-chain PDAs ──────────────────────────────────────────────────────
const distIdHash = sha256(DISTRIBUTION_ID);
const projectIdHash = sha256(PROJECT_ID);
const [distributionPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("distribution"), project.publicKey.toBuffer(), distIdHash],
  PROGRAM_ID,
);
const vault = getAssociatedTokenAddressSync(MINT, distributionPda, true);

// ── instruction builders (raw anchor encoding, struct-order accounts) ──

function initializeIx(): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: project.publicKey, isSigner: true, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: distributionPda, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([ixDiscriminator("initialize_distribution"), distIdHash, projectIdHash, u64le(TOTAL)]),
  });
}

function fundIx(): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: project.publicKey, isSigner: true, isWritable: true },
      { pubkey: distributionPda, isSigner: false, isWritable: true },
      { pubkey: projectAta, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: ixDiscriminator("fund_distribution"),
  });
}

function commitIx(root: Buffer, manifestHashBytes: Buffer, recipients: number): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: project.publicKey, isSigner: true, isWritable: true },
      { pubkey: distributionPda, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([ixDiscriminator("commit_root"), root, manifestHashBytes, u32le(recipients)]),
  });
}

function openIx(): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: project.publicKey, isSigner: true, isWritable: true },
      { pubkey: distributionPda, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
    ],
    data: ixDiscriminator("open_claims"),
  });
}

function claimIx(
  claimant: Keypair,
  claimantAta: PublicKey,
  distributionId: string,
  amount: bigint,
  proof: Buffer[],
): TransactionInstruction {
  const [receiptPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), distributionPda.toBuffer(), claimant.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: claimant.publicKey, isSigner: true, isWritable: true },
      { pubkey: distributionPda, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: claimantAta, isSigner: false, isWritable: true },
      { pubkey: receiptPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      ixDiscriminator("claim"),
      borshString(distributionId),
      u64le(amount),
      u32le(proof.length),
      Buffer.concat(proof),
    ]),
  });
}

const send = (ix: TransactionInstruction, signers: Keypair[]): Promise<string> =>
  sendAndConfirmTransaction(connection, new Transaction().add(ix), signers).then((sig) => {
    console.log(`    tx: https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(RPC)}`);
    return sig;
  });

/** Offsets within DistributionAccount data (8-byte anchor disc + fixed fields). */
const OFF = { total: 8 + 32 * 7, recipients: 8 + 32 * 7 + 8, claimed: 8 + 32 * 7 + 8 + 4, status: 8 + 32 * 7 + 8 + 4 + 8 } as const;
async function distributionState(): Promise<{ status: number; claimed: bigint; total: bigint }> {
  const info = await connection.getAccountInfo(distributionPda);
  if (info === null) throw new Error("distribution account not found");
  return {
    status: info.data[OFF.status]!,
    claimed: info.data.readBigUInt64LE(OFF.claimed),
    total: info.data.readBigUInt64LE(OFF.total),
  };
}

const mayaProof = merkleProof(tree, leaves[0]!).map((b) => Buffer.from(b));
const danProof = merkleProof(tree, leaves[1]!).map((b) => Buffer.from(b));

// ── the §21 matrix ─────────────────────────────────────────────────────

console.log("1. initialize");
await send(initializeIx(), [project]);
{
  const s = await distributionState();
  ok("initialize PASS (PENDING, total recorded)", s.status === 0 && s.total === TOTAL);
}

console.log("2. fund exact amount");
await send(fundIx(), [project]);
{
  const vaultBalance = (await connection.getTokenAccountBalance(vault)).value.amount;
  const s = await distributionState();
  ok("fund exact amount PASS (FUNDED, vault=10000)", s.status === 1 && vaultBalance === TOTAL.toString(), `vault=${vaultBalance}`);
}

console.log("3. claim before commit/open → FAIL");
await expectTxFailure("claim before LIVE FAIL", () => send(claimIx(maya, mayaAta, DISTRIBUTION_ID, 5000n, mayaProof), [maya]));

console.log("4. commit root");
await send(commitIx(tree.root, Buffer.from(manifestHashHex, "hex"), allocations.length), [project]);
{
  const s = await distributionState();
  ok("root commit PASS (COMMITTED)", s.status === 2);
}

console.log("5. root mutation after commit → FAIL");
await expectTxFailure("root mutation after commit FAIL", () =>
  send(commitIx(sha256("evil-root"), Buffer.alloc(32, 1), 2), [project]),
);

console.log("6. open claims");
await send(openIx(), [project]);
{
  const s = await distributionState();
  ok("open claims PASS (LIVE)", s.status === 3);
}

console.log("7. negative claim cases");
await expectTxFailure("wrong amount FAIL", () => send(claimIx(maya, mayaAta, DISTRIBUTION_ID, 4999n, mayaProof), [maya]));
const tamperedProof = mayaProof.map((b, i) => (i === 0 ? Buffer.alloc(32, 0xab) : b));
await expectTxFailure("wrong proof FAIL", () => send(claimIx(maya, mayaAta, DISTRIBUTION_ID, 5000n, tamperedProof), [maya]));
await expectTxFailure("sib (no allocation) claim FAIL", () => send(claimIx(sib, sibAta, DISTRIBUTION_ID, 5000n, danProof), [sib]));
await expectTxFailure("cross-distribution proof FAIL", () => send(claimIx(maya, mayaAta, "dst_other_999", 5000n, mayaProof), [maya]));

console.log("8. Maya claim PASS");
await send(claimIx(maya, mayaAta, DISTRIBUTION_ID, 5000n, mayaProof), [maya]);
{
  const mayaBalance = (await connection.getTokenAccountBalance(mayaAta)).value.amount;
  const s = await distributionState();
  ok("Maya claim PASS (5000 received, claimed=5000)", mayaBalance === "5000" && s.claimed === 5000n, `maya=${mayaBalance} claimed=${s.claimed}`);
}

console.log("9. Maya second claim → FAIL (program-level double claim)");
await expectTxFailure("Maya second claim FAIL", () => send(claimIx(maya, mayaAta, DISTRIBUTION_ID, 5000n, mayaProof), [maya]));

console.log("10. Dan claim PASS");
await send(claimIx(dan, danAta, DISTRIBUTION_ID, 5000n, danProof), [dan]);
{
  const danBalance = (await connection.getTokenAccountBalance(danAta)).value.amount;
  const s = await distributionState();
  ok("Dan claim PASS (5000 received, claimed=10000)", danBalance === "5000" && s.claimed === TOTAL, `dan=${danBalance} claimed=${s.claimed}`);
}

console.log("11. conservation");
{
  const vaultBalance = BigInt((await connection.getTokenAccountBalance(vault)).value.amount);
  const s = await distributionState();
  ok("allocation conservation PASS (Σ=total)", allocations.reduce((acc, a) => acc + BigInt(a.amount), 0n) === s.total);
  ok("vault conservation PASS (vault+claimed=funded)", vaultBalance + s.claimed === TOTAL, `vault=${vaultBalance} claimed=${s.claimed}`);
}

console.log("");
console.log(`LOCALNET MATRIX RESULT: pass=${pass} fail=${fail}`);
console.log(`distribution: ${distributionPda.toBase58()}`);
console.log(`vault:        ${vault.toBase58()}`);
console.log(`mint:         ${MINT.toBase58()}`);
console.log(`root:         ${rootHex}`);
console.log(`manifest:     ${manifestHashHex}`);
if (fail > 0) process.exit(1);
