import { test } from "node:test";
import assert from "node:assert/strict";
import { Transaction } from "@solana/web3.js";
import { verifyMerkleProof } from "@odp/domain";
import { DISTRIBUTOR_PROGRAM_ID } from "@odp/distribution-engine";
import { decideClaim, generatePassportForProject } from "../src/verify-claims.js";
import { submitProject, type ProjectClaimInput } from "../src/intake-project.js";
import { planRun } from "../src/runner.js";
import { assertClaimable, buildClaimTransaction, offlineBlockhash, recordClaim } from "../src/claim-tx.js";
import { base58Decode } from "../src/base58.js";
import { createHash } from "node:crypto";
import { enrollHuman, generateWalletKeys, makeTempStore, T } from "./helpers.js";
import { Keypair } from "@solana/web3.js";

/* The DRY RUN gate: a real-style project + 3 enrolled humans through the
   frozen engines only — Passport → ALLOW → Match → explicit N allocations →
   Merkle root → Manifest — plus the two P1-A review proofs. */

const ALLOW_CLAIMS: ProjectClaimInput[] = [
  {
    dimension: "TEAM",
    statement: "Founders are public with previously shipped embedded products",
    url: "https://helios.example/team",
    proposed_findings: ["FOUNDERS_PUBLIC", "PRIOR_SHIPPED"],
  },
  {
    dimension: "PRODUCT",
    statement: "Working telemetry dashboard on devnet",
    url: "https://testnet.helios.example",
    proposed_findings: ["TESTNET_WORKING"],
  },
  {
    dimension: "CODE",
    statement: "Public repository with active daily commits",
    url: "https://github.com/helios-grid/monorepo",
    proposed_findings: ["ACTIVE_DEVELOPMENT"],
  },
  {
    dimension: "TOKEN",
    statement: "Mint and freeze authority revoked, LP locked, no transfer tax",
    url: "https://helios.example/tokenomics",
    proposed_findings: ["MINT_AUTHORITY_REVOKED", "FREEZE_AUTHORITY_REVOKED", "NO_TRANSFER_TAX"],
  },
  {
    dimension: "ONCHAIN",
    statement: "No abnormal treasury flows observed",
    url: null,
    proposed_findings: ["NO_ABNORMAL_FLOWS"],
  },
  {
    dimension: "SOCIAL",
    statement: "Organic community growth with a low bot ratio",
    url: "https://x.com/heliosgrid",
    proposed_findings: ["ORGANIC_GROWTH", "LOW_BOT_RATIO"],
  },
];

function submitHelios(store: ReturnType<typeof makeTempStore>, withUnverifiedExtra = false) {
  const keys = generateWalletKeys();
  const result = submitProject(store, {
    name: "Helios Grid",
    symbol: "HELIOS",
    website: "https://helios.example",
    x_account: "@heliosgrid",
    github: "https://github.com/helios-grid/monorepo",
    token_address: null,
    wallet: keys.pubkey,
    intent_text: "We need solana depin early adopters with hardware to pilot grid telemetry",
    target_tags: ["solana", "depin", "early_adopter", "hardware"],
    discovery_source: "network",
    claims: withUnverifiedExtra
      ? [...ALLOW_CLAIMS, { dimension: "PRODUCT" as const, statement: "We claim LIVE MAINNET (unverified)", url: null, proposed_findings: ["LIVE_MAINNET" as const] }]
      : ALLOW_CLAIMS,
  });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

test("DRY RUN: project → verified evidence → ALLOW passport → match → N allocations → root → manifest", () => {
  const store = makeTempStore();
  const submitted = submitHelios(store, true);
  assert.equal(submitted.project.status, "SUBMITTED");
  assert.equal(submitted.claims.length, 7);

  // operator verifies exactly the six ALLOW-baseline claims; the 7th stays UNVERIFIED
  for (const c of submitted.claims.slice(0, 6)) {
    decideClaim(store, submitted.project.project_id, c.claim_id, {
      verifier: "commander",
      decision: "VERIFIED",
      note: "URL checked",
    });
  }

  const passport = generatePassportForProject(store, submitted.project.project_id);
  assert.equal(passport.status, "ALLOW");
  // D5-R proof: the UNVERIFIED "LIVE MAINNET" claim never reached the passport
  const productDetails = JSON.stringify(passport.dims.PRODUCT.evidence);
  assert.ok(!productDetails.includes("LIVE MAINNET"));
  assert.ok(passport.dims.PRODUCT.evidence.length >= 1);

  // 3 real humans, wallet-verified and consented
  const h1 = enrollHuman(store, { handle: "@ada", interests: ["solana", "depin", "early_adopter"] });
  const h2 = enrollHuman(store, { handle: "@ben", interests: ["solana", "hardware"] });
  const h3 = enrollHuman(store, { handle: "@cy", interests: ["early_adopter", "depin"] });

  const planned = planRun(store, { project_id: submitted.project.project_id, total_amount: "3000", recipient_count: 3 });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const run = planned.run;

  assert.equal(run.status, "DRY");
  assert.equal(run.allocations.length, 3);
  assert.equal(run.recipient_count, 3); // explicit N, not the frozen default top-2
  for (const a of run.allocations) assert.equal(a.amount, "1000"); // equal split, exact division
  assert.match(run.root, /^[0-9a-f]{64}$/);
  assert.match(run.manifest_hash, /^[0-9a-f]{64}$/);

  // every wallet has a proof that verifies against the root
  for (const a of run.allocations) {
    const leaf = Buffer.from(
      createHash("sha256").update(`${run.distribution_id}\n${a.wallet}\n${a.amount}`).digest(),
    );
    const proof = run.proofs[a.wallet]!.map((p) => Buffer.from(base58Decode(p)));
    assert.equal(verifyMerkleProof(leaf, proof, Buffer.from(run.root, "hex")), true, `proof for ${a.human_id}`);
    assert.ok(proof.length >= 1);
  }

  // matches are deterministic: score DESC, human_id ASC
  const scores = run.matches.filter((m) => m.score > 0).map((m) => m.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  void h1; void h2; void h3;
});

test("divisibility fails closed before any allocation is built", () => {
  const store = makeTempStore();
  const submitted = submitHelios(store);
  for (const c of submitted.claims) {
    decideClaim(store, submitted.project.project_id, c.claim_id, { verifier: "commander", decision: "VERIFIED" });
  }
  generatePassportForProject(store, submitted.project.project_id);
  for (let i = 0; i < 3; i++) enrollHuman(store, { handle: `@human${i}` });

  const bad = planRun(store, { project_id: submitted.project.project_id, total_amount: "1000", recipient_count: 3 });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.reason, /divisible/);
  assert.equal(store.runs.list().length, 0); // nothing persisted on failure
});

test("non-ALLOW passports are hard-gated out of matching", () => {
  const store = makeTempStore();
  const submitted = submitHelios(store);
  // operator verifies only TEAM + CODE → other dims have no evidence → WATCH
  for (const c of submitted.claims.filter((c) => c.dimension === "TEAM" || c.dimension === "CODE")) {
    decideClaim(store, submitted.project.project_id, c.claim_id, { verifier: "commander", decision: "VERIFIED" });
  }
  const passport = generatePassportForProject(store, submitted.project.project_id);
  assert.equal(passport.status, "WATCH");
  for (let i = 0; i < 3; i++) enrollHuman(store, { handle: `@human${i}` });

  const denied = planRun(store, { project_id: submitted.project.project_id, total_amount: "3000", recipient_count: 3 });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.match(denied.reason, /WATCH.*ALLOW|ALLOW/);
});

test("requesting more recipients than the eligible pool fails closed", () => {
  const store = makeTempStore();
  const submitted = submitHelios(store);
  for (const c of submitted.claims) {
    decideClaim(store, submitted.project.project_id, c.claim_id, { verifier: "commander", decision: "VERIFIED" });
  }
  generatePassportForProject(store, submitted.project.project_id);
  enrollHuman(store); // only 1

  const short = planRun(store, { project_id: submitted.project.project_id, total_amount: "2000", recipient_count: 2 });
  assert.equal(short.ok, false);
  if (!short.ok) assert.match(short.reason, /eligible pool has 1/);
});

test("self-custody claim: guards, unsigned-tx build for the human wallet, ledger recording", () => {
  const store = makeTempStore();
  const submitted = submitHelios(store);
  for (const c of submitted.claims) {
    decideClaim(store, submitted.project.project_id, c.claim_id, { verifier: "commander", decision: "VERIFIED" });
  }
  generatePassportForProject(store, submitted.project.project_id);
  const h1 = enrollHuman(store, { handle: "@ada", interests: ["solana", "depin", "early_adopter"] });
  const h2 = enrollHuman(store, { handle: "@ben", interests: ["solana", "hardware"] });
  const h3 = enrollHuman(store, { handle: "@cy", interests: ["early_adopter", "depin"] });
  const planned = planRun(store, { project_id: submitted.project.project_id, total_amount: "3000", recipient_count: 3 });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  let run = planned.run;

  // not prepared → cannot claim
  const notPrepared = assertClaimable(store, run, h1.wallet);
  assert.equal(notPrepared.ok, false);
  if (!notPrepared.ok) assert.match(notPrepared.reason, /not prepared/);

  // go live on devnet (fixture addresses from real keypairs)
  const mint = Keypair.generate().publicKey;
  const distributionPda = Keypair.generate().publicKey;
  const vault = Keypair.generate().publicKey;
  run = {
    ...run,
    status: "LIVE",
    token_mint: mint.toBase58(),
    onchain: {
      network: "devnet",
      rpc: "https://api.devnet.solana.com",
      program_id: DISTRIBUTOR_PROGRAM_ID.toBase58(),
      mint: mint.toBase58(),
      distribution_pda: distributionPda.toBase58(),
      vault: vault.toBase58(),
      txs: { initialize: "sig-init", fund: "sig-fund", commit: "sig-commit", open: "sig-open" },
      prepared_at: T,
    },
  };
  store.runs.save(run);

  // an unknown wallet has no allocation here
  const outsider = generateWalletKeys();
  const noAlloc = assertClaimable(store, run, outsider.pubkey);
  assert.equal(noAlloc.ok, false);
  if (!noAlloc.ok) assert.match(noAlloc.reason, /no allocation/);

  // happy path: backend builds the UNSIGNED tx, fee payer = the human
  const built = buildClaimTransaction({ run, wallet: h1.wallet, ...offlineBlockhash() });
  assert.equal(built.amount, "1000");
  assert.match(built.receipt_pda, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
  const feePayer = tx.feePayer;
  assert.ok(feePayer);
  assert.deepEqual(feePayer.toBytes(), base58Decode(h1.wallet));
  assert.equal(tx.signatures.length, 1);
  assert.deepEqual(tx.signatures[0]!.publicKey.toBytes(), base58Decode(h1.wallet));
  assert.ok(tx.instructions[0]!.programId.equals(DISTRIBUTOR_PROGRAM_ID));

  // ledger recording progresses the human and blocks re-claiming
  recordClaim(store, run, h1.human_id, { claim_tx: "sig-claim-1", receipt_pda: built.receipt_pda });
  assert.equal(store.humans.get(h1.human_id)?.status, "CLAIMED");
  const updated = store.runs.get(run.run_id)!;
  assert.equal(updated.claims[h1.human_id]?.claim_tx, "sig-claim-1");

  const again = assertClaimable(store, updated, h1.wallet);
  assert.equal(again.ok, false);
  if (!again.ok) assert.match(again.reason, /already claimed/);

  // h2 and h3 remain claimable
  assert.equal(assertClaimable(store, updated, h2.wallet).ok, true);
  assert.equal(assertClaimable(store, updated, h3.wallet).ok, true);
});
