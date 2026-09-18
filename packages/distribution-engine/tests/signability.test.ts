import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
import {
  DISTRIBUTOR_PROGRAM_ID,
  distributionPda,
  initializeDistributionIx,
  fundDistributionIx,
  commitRootIx,
  openClaimsIx,
  claimIx,
  assembleSigned,
} from "../src/instructions.js";
import type { DistributionAddresses } from "../src/instructions.js";

/**
 * P0-4B-R1 offline signability regression (no RPC, no SOL needed).
 *
 * Purpose: every transaction the devnet evidence run will submit — the
 * positive golden path AND every expected-failure case — must clear local
 * `tx.sign()` + `serialize()`. A client-side "unknown signer" here would
 * otherwise waste a funded distribution mid-run.
 *
 * Rule under test: expected-failure tx fee payer = first REQUIRED signer;
 * claim negatives sign with the claimant only (the claim instruction has no
 * project account), root-mutation signs with the project authority.
 */

const DUMMY_BLOCKHASH = "11111111111111111111111111111111";

function kp(name: string): Keypair {
  return Keypair.fromSeed(createHash("sha256").update(`odp-signability-${name}`).digest());
}

const project = kp("project");
const maya = kp("maya");
const dan = kp("dan");
const sib = kp("sib");
const mint = kp("mint").publicKey;
const mayaAta = kp("maya-ata").publicKey;
const danAta = kp("dan-ata").publicKey;
const sibAta = kp("sib-ata").publicKey;
const projectAta = kp("project-ata").publicKey;

const DISTRIBUTION_ID = "dst_signability_offline_001";
const pda = distributionPda({
  authority: project.publicKey,
  distributionId: DISTRIBUTION_ID,
  programId: DISTRIBUTOR_PROGRAM_ID,
});

const ADDR: DistributionAddresses = {
  programId: DISTRIBUTOR_PROGRAM_ID,
  authority: project.publicKey,
  mint,
  distributionPda: pda,
  vault: kp("vault").publicKey,
  authorityToken: projectAta,
  distributionId: DISTRIBUTION_ID,
  projectId: "prj_signability",
  total: 10_000n,
};

const PROOF = [Buffer.alloc(32, 0xaa), Buffer.alloc(32, 0xbb)];

function claim(
  claimant: Keypair,
  claimantAta: PublicKey,
  distributionId: string,
  amount: bigint,
) {
  return claimIx(
    { programId: DISTRIBUTOR_PROGRAM_ID },
    claimant.publicKey,
    claimantAta,
    pda,
    ADDR.vault,
    distributionId,
    amount,
    PROOF,
  ).ix;
}

interface Case {
  label: string;
  ix: Parameters<typeof assembleSigned>[0];
  signers: Keypair[];
}

const CASES: Case[] = [
  // positive golden path
  { label: "initialize_distribution [project]", ix: initializeDistributionIx(ADDR), signers: [project] },
  { label: "fund_distribution [project]", ix: fundDistributionIx(ADDR), signers: [project] },
  {
    label: "commit_root [project]",
    ix: commitRootIx(ADDR, Buffer.alloc(32, 0x01), Buffer.alloc(32, 0x02), 2),
    signers: [project],
  },
  { label: "open_claims [project]", ix: openClaimsIx(ADDR), signers: [project] },
  { label: "maya_claim [maya]", ix: claim(maya, mayaAta, DISTRIBUTION_ID, 5000n), signers: [maya] },
  { label: "dan_claim [dan]", ix: claim(dan, danAta, DISTRIBUTION_ID, 5000n), signers: [dan] },
  // expected-failure cases (P0-4B-R1 signer lock)
  { label: "claim_before_live_REJECTED [maya]", ix: claim(maya, mayaAta, DISTRIBUTION_ID, 5000n), signers: [maya] },
  { label: "wrong_amount_REJECTED [maya]", ix: claim(maya, mayaAta, DISTRIBUTION_ID, 4999n), signers: [maya] },
  { label: "wrong_proof_REJECTED [maya]", ix: claim(maya, mayaAta, DISTRIBUTION_ID, 5000n), signers: [maya] },
  { label: "sib_no_allocation_REJECTED [sib]", ix: claim(sib, sibAta, DISTRIBUTION_ID, 5000n), signers: [sib] },
  { label: "cross_distribution_REJECTED [maya]", ix: claim(maya, mayaAta, "dst_other_999", 5000n), signers: [maya] },
  { label: "maya_second_claim_REJECTED [maya]", ix: claim(maya, mayaAta, DISTRIBUTION_ID, 5000n), signers: [maya] },
  {
    label: "root_mutation_REJECTED [project]",
    ix: commitRootIx(ADDR, Buffer.alloc(32, 0x03), Buffer.alloc(32, 0x04), 2),
    signers: [project],
  },
];

describe("offline signability regression (P0-4B-R1)", () => {
  for (const c of CASES) {
    it(`${c.label}: signs + serializes offline, feePayer = first required signer`, () => {
      const tx = assembleSigned(c.ix, c.signers, DUMMY_BLOCKHASH);
      assert.equal(tx.feePayer?.toBase58(), c.signers[0]!.publicKey.toBase58());
      const raw = tx.serialize();
      assert.ok(raw.length > 100);
      // every signer produced a signature
      assert.equal(tx.signatures.length, c.signers.length);
      for (const s of tx.signatures) assert.ok(s.signature && s.signature.length === 64);
    });
  }

  it("negative control: attaching a non-required signer (old bug) throws unknown signer", () => {
    const ix = claim(maya, mayaAta, DISTRIBUTION_ID, 5000n);
    assert.throws(() => assembleSigned(ix, [maya, project], DUMMY_BLOCKHASH), /unknown signer/i);
  });
});
