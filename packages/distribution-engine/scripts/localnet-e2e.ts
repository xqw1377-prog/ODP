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
import { readFileSync, writeFileSync } from "node:fs";
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
import {
  DISTRIBUTOR_PROGRAM_ID as PROGRAM_ID,
  distributionPda as deriveDistributionPda,
  initializeDistributionIx,
  fundDistributionIx,
  commitRootIx,
  openClaimsIx,
  claimIx as buildClaimIx,
  assembleSigned,
} from "../src/instructions.js";
import type { DistributionAddresses } from "../src/instructions.js";

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

const RPC = process.env.ODP_LOCALNET_RPC ?? "http://127.0.0.1:8899";
/** Devnet evidence runs override this (ODP_DISTRIBUTION_ID=dst_aurora_devnet_001) to avoid PDA collisions. */
const DISTRIBUTION_ID = process.env.ODP_DISTRIBUTION_ID ?? "dst_aurora_demo_001";
const PROJECT_ID = "prj_aurora_net";
const TOTAL = 10_000n;
const IS_DEVNET = RPC.includes("devnet");
const EXPLORER = (sig: string): string =>
  IS_DEVNET
    ? `https://explorer.solana.com/tx/${sig}?cluster=devnet`
    : `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(RPC)}`;

interface EvidenceRecord {
  cluster: string;
  distribution_id: string;
  at: string;
  program_id: string;
  keys: Record<string, string>;
  values: Record<string, string>;
  transactions: Record<string, { signature: string; explorer: string; err?: string; log_tail?: string[] }>;
  checks: string[];
}
const EVIDENCE: EvidenceRecord = {
  cluster: RPC,
  distribution_id: DISTRIBUTION_ID,
  at: new Date().toISOString(),
  program_id: PROGRAM_ID.toBase58(),
  keys: {},
  values: {},
  transactions: {},
  checks: [],
};

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

/**
 * Submit an EXPECTED-TO-FAIL transaction with skipPreflight so it actually
 * lands on chain, then read back its signature + program logs. The rejection
 * is then verifiable in Solana Explorer, not just in our console.
 */
async function expectFailureEvidenced(label: string, ix: TransactionInstruction, signers: Keypair[]): Promise<void> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  // fee payer = first required signer, set explicitly (P0-4B-R1 signer lock)
  const tx = assembleSigned(ix, signers, blockhash, lastValidBlockHeight);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });

  let info: Awaited<ReturnType<typeof connection.getTransaction>> = null;
  for (let i = 0; i < 45 && info === null; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    info = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
  }
  if (info === null) {
    ok(label, false, `failure tx never landed: ${sig}`);
    return;
  }
  const err = info.meta?.err ?? null;
  const logs = info.meta?.logMessages ?? [];
  const tail = logs.slice(-6);
  ok(label, err !== null, err !== null ? `${sig}` : "transaction unexpectedly succeeded");
  console.log(`    explorer: ${EXPLORER(sig)}`);
  for (const line of tail) console.log(`    log: ${line.slice(0, 160)}`);
  EVIDENCE.transactions[label] = {
    signature: sig,
    explorer: EXPLORER(sig),
    err: err === null ? undefined : JSON.stringify(err),
    log_tail: tail,
  };
}

async function recordTx(label: string, sig: string): Promise<void> {
  EVIDENCE.transactions[label] = { signature: sig, explorer: EXPLORER(sig) };
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
EVIDENCE.keys = {
  project_authority: project.publicKey.toBase58(),
  maya: maya.publicKey.toBase58(),
  dan: dan.publicKey.toBase58(),
  sib: sib.publicKey.toBase58(),
};

// ── single-wallet fan-out (P0-4B §A2) ─────────────────────────────────
// Only the project wallet needs external funding; it tops up the humans.
{
  const LAMPORTS = 1_000_000_000;
  const MIN_HUMAN = 0.02 * LAMPORTS;
  const TOPUP = 0.05 * LAMPORTS;
  const projectBalance = await connection.getBalance(project.publicKey);
  console.log(`project wallet: ${project.publicKey.toBase58()} = ${projectBalance / LAMPORTS} SOL`);
  if (projectBalance < 0.05 * LAMPORTS) {
    throw new Error(`project wallet underfunded (${projectBalance} lamports) — fund it with devnet SOL first`);
  }
  for (const [name, kp] of [["maya", maya], ["dan", dan], ["sib", sib]] as const) {
    const bal = await connection.getBalance(kp.publicKey);
    if (bal < MIN_HUMAN) {
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: project.publicKey, toPubkey: kp.publicKey, lamports: TOPUP }),
      );
      const sig = await sendAndConfirmTransaction(connection, tx, [project]);
      console.log(`  fan-out ${name}: ${EXPLORER(sig)}`);
      EVIDENCE.transactions[`fanout_${name}`] = { signature: sig, explorer: EXPLORER(sig) };
    } else {
      console.log(`  ${name} already funded (${bal / LAMPORTS} SOL)`);
    }
  }
}

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

// ── on-chain PDAs + shared instruction builders ─────────────────────────
const distributionPda = deriveDistributionPda({
  authority: project.publicKey,
  distributionId: DISTRIBUTION_ID,
  programId: PROGRAM_ID,
});
const vault = getAssociatedTokenAddressSync(MINT, distributionPda, true);

const ADDR: DistributionAddresses = {
  programId: PROGRAM_ID,
  authority: project.publicKey,
  mint: MINT,
  distributionPda,
  vault,
  authorityToken: projectAta,
  distributionId: DISTRIBUTION_ID,
  projectId: PROJECT_ID,
  total: TOTAL,
};

// signers[0] is the fee payer for every tx below (see src/instructions.ts)
const claimIx = (
  claimant: Keypair,
  claimantAta: PublicKey,
  distributionId: string,
  amount: bigint,
  proof: Buffer[],
): TransactionInstruction =>
  buildClaimIx(
    { programId: PROGRAM_ID },
    claimant.publicKey,
    claimantAta,
    distributionPda,
    vault,
    distributionId,
    amount,
    proof,
  ).ix;

// Explicit fresh blockhash per attempt + retry: the public devnet RPC is
// load-balanced and web3's cached latest blockhash can hit "Blockhash not
// found" on another backend after the negative-evidence polling pauses.
const send = async (label: string, ix: TransactionInstruction, signers: Keypair[]): Promise<string> => {
  for (let attempt = 1; ; attempt++) {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: signers[0]!.publicKey, blockhash, lastValidBlockHeight }).add(ix);
      const sig = await sendAndConfirmTransaction(connection, tx, signers);
      console.log(`    tx: ${EXPLORER(sig)}`);
      EVIDENCE.transactions[label] = { signature: sig, explorer: EXPLORER(sig) };
      return sig;
    } catch (err) {
      if (attempt < 5 && /Blockhash not found/i.test(String(err))) {
        console.log(`    (retry ${attempt}: transient devnet blockhash skew)`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
};

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
await send("initialize_distribution", initializeDistributionIx(ADDR), [project]);
{
  const s = await distributionState();
  ok("initialize PASS (PENDING, total recorded)", s.status === 0 && s.total === TOTAL);
}

console.log("2. fund exact amount");
await send("fund_distribution", fundDistributionIx(ADDR), [project]);
{
  const vaultBalance = (await connection.getTokenAccountBalance(vault)).value.amount;
  const s = await distributionState();
  ok("fund exact amount PASS (FUNDED, vault=10000)", s.status === 1 && vaultBalance === TOTAL.toString(), `vault=${vaultBalance}`);
}

console.log("3. claim before commit/open → FAIL (evidenced on-chain)");
await expectFailureEvidenced("claim_before_live_REJECTED", claimIx(maya, mayaAta, DISTRIBUTION_ID, 5000n, mayaProof), [maya]);

console.log("4. commit root");
await send("commit_root", commitRootIx(ADDR, tree.root, Buffer.from(manifestHashHex, "hex"), allocations.length), [project]);
{
  const s = await distributionState();
  ok("root commit PASS (COMMITTED)", s.status === 2);
}

console.log("5. root mutation after commit → FAIL (evidenced on-chain)");
await expectFailureEvidenced(
  "root_mutation_REJECTED",
  commitRootIx(ADDR, sha256("evil-root"), Buffer.alloc(32, 1), 2),
  [project],
);

console.log("6. open claims");
await send("open_claims", openClaimsIx(ADDR), [project]);
{
  const s = await distributionState();
  ok("open claims PASS (LIVE)", s.status === 3);
}

console.log("7. negative claim cases (evidenced on-chain)");
await expectFailureEvidenced("wrong_amount_REJECTED", claimIx(maya, mayaAta, DISTRIBUTION_ID, 4999n, mayaProof), [maya]);
const tamperedProof = mayaProof.map((b, i) => (i === 0 ? Buffer.alloc(32, 0xab) : b));
await expectFailureEvidenced("wrong_proof_REJECTED", claimIx(maya, mayaAta, DISTRIBUTION_ID, 5000n, tamperedProof), [maya]);
await expectFailureEvidenced("sib_no_allocation_REJECTED", claimIx(sib, sibAta, DISTRIBUTION_ID, 5000n, danProof), [sib]);
await expectFailureEvidenced("cross_distribution_REJECTED", claimIx(maya, mayaAta, "dst_other_999", 5000n, mayaProof), [maya]);

console.log("8. Maya claim PASS");
await send("maya_claim", claimIx(maya, mayaAta, DISTRIBUTION_ID, 5000n, mayaProof), [maya]);
{
  const mayaBalance = (await connection.getTokenAccountBalance(mayaAta)).value.amount;
  const s = await distributionState();
  ok("Maya claim PASS (5000 received, claimed=5000)", mayaBalance === "5000" && s.claimed === 5000n, `maya=${mayaBalance} claimed=${s.claimed}`);
}

console.log("9. Maya second claim → FAIL (evidenced on-chain, program-level double-claim rejection)");
await expectFailureEvidenced("maya_second_claim_REJECTED", claimIx(maya, mayaAta, DISTRIBUTION_ID, 5000n, mayaProof), [maya]);

console.log("10. Dan claim PASS");
await send("dan_claim", claimIx(dan, danAta, DISTRIBUTION_ID, 5000n, danProof), [dan]);
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

// ── evidence summary ────────────────────────────────────────────────────
{
  const version = await connection.getVersion();
  const mayaBalance = (await connection.getTokenAccountBalance(mayaAta)).value.amount;
  const danBalance = (await connection.getTokenAccountBalance(danAta)).value.amount;
  const vaultBalance = (await connection.getTokenAccountBalance(vault)).value.amount;
  const s = await distributionState();
  EVIDENCE.values = {
    cluster_version: String(version["solana-core"] ?? JSON.stringify(version)),
    demo_mint: MINT.toBase58(),
    distribution_pda: distributionPda.toBase58(),
    vault: vault.toBase58(),
    allocation_maya: "5000",
    allocation_dan: "5000",
    allocation_root: rootHex,
    manifest_hash: manifestHashHex,
    claimed_amount: s.claimed.toString(),
    total_amount: s.total.toString(),
    maya_token_balance: mayaBalance,
    dan_token_balance: danBalance,
    vault_token_balance: vaultBalance,
  };
  EVIDENCE.checks.push(
    `claimed_amount = ${s.claimed}`,
    `maya = ${mayaBalance}, dan = ${danBalance}, vault = ${vaultBalance}`,
    `vault + claimed = ${vaultBalance} + ${s.claimed} = ${BigInt(vaultBalance) + s.claimed} (funded = ${TOTAL})`,
    `matrix: pass=${pass} fail=${fail}`,
  );
}

console.log("");
console.log(`MATRIX RESULT: pass=${pass} fail=${fail}`);
console.log(`distribution: ${distributionPda.toBase58()}`);
console.log(`vault:        ${vault.toBase58()}`);
console.log(`mint:         ${MINT.toBase58()}`);
console.log(`root:         ${rootHex}`);
console.log(`manifest:     ${manifestHashHex}`);

if (IS_DEVNET) {
  const file = path.join(REPO, "docs", `devnet-evidence-${DISTRIBUTION_ID}.md`);
  const lines = [
    `# Devnet Evidence — ${DISTRIBUTION_ID}`,
    "",
    `- generated: ${EVIDENCE.at}`,
    `- cluster: \`${RPC}\` (solana-core ${EVIDENCE.values.cluster_version})`,
    `- program id: \`${EVIDENCE.program_id}\``,
    "",
    "## Keys",
    ...Object.entries(EVIDENCE.keys).map(([k, v]) => `- ${k}: \`${v}\``),
    "",
    "## Snapshot",
    ...Object.entries(EVIDENCE.values).map(([k, v]) => `- ${k}: \`${v}\``),
    "",
    "## Transactions",
    ...Object.entries(EVIDENCE.transactions).flatMap(([k, v]) => [
      `### ${k}`,
      `- signature: \`${v.signature}\``,
      `- explorer: ${v.explorer}`,
      ...(v.err ? [`- error: \`${v.err}\``] : []),
      ...(v.log_tail ? ["- program log tail:", "```text", ...v.log_tail.map((l) => l.slice(0, 200)), "```"] : []),
    ]),
    "",
    "## Checks",
    ...EVIDENCE.checks.map((c) => `- ${c}`),
    "",
  ];
  writeFileSync(file, lines.join("\n"), "utf8");
  console.log(`evidence written: ${file}`);
}

if (fail > 0) process.exit(1);
