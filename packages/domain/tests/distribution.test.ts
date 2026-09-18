import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  createDistribution,
  applyDistributionEvent,
  assertAllocationConservation,
  AllocationSchema,
  allocationLeaf,
  buildMerkleTree,
  merkleProof,
  verifyMerkleProof,
} from "../src/index.js";
import type { Allocation } from "../src/index.js";

const MINT = "AURAt0kEnAddr3ssExampleX7qVNE9dJm1LkzPwR4TgHc";
const DST = "dst_001";

function allocations(): Allocation[] {
  const rows: [string, string, string][] = [
    ["hum_maya", "MayaWa11etAddressExample1111111111111111111111", "4200"],
    ["hum_dev_dan", "DanWa11etAddressExample22222222222222222222222", "3100"],
    ["hum_sib", "SibWa11etAddressExample33333333333333333333333", "700"],
  ];
  return rows.map(([human_id, wallet, amount]) =>
    AllocationSchema.parse({ distribution_id: DST, human_id, wallet, amount }),
  );
}

function funded() {
  return applyDistributionEvent(
    createDistribution(DST, "prj_aurora_net", MINT, "8000"),
    { type: "DEPOSIT_CONFIRMED", vault: "Va11tAddressExample0000000000000000000000000", deposit_tx: "DepositTxExample000000000000000000000000000000000", at: "2026-09-18T01:00:00Z" },
  );
}

// ── Lifecycle state machine ────────────────────────────────────────────

describe("distribution state machine", () => {
  it("happy path: PENDING_DEPOSIT → DEPOSITED → COMMITTED → LIVE → CLOSED", () => {
    const leaves = allocations().map(allocationLeaf);
    const root = buildMerkleTree(leaves).root;

    let d = funded();
    assert.equal(d.status, "DEPOSITED");
    assert.equal(d.vault, "Va11tAddressExample0000000000000000000000000");

    d = applyDistributionEvent(d, { type: "ROOT_COMMITTED", allocation_root: root.toString("hex"), total_recipients: 3, at: "2026-09-18T02:00:00Z" });
    assert.equal(d.status, "COMMITTED");
    assert.equal(d.total_recipients, 3);
    assert.equal(d.allocation_root, root.toString("hex"));

    d = applyDistributionEvent(d, { type: "CLAIMS_OPENED", at: "2026-09-18T03:00:00Z" });
    assert.equal(d.status, "LIVE");

    d = applyDistributionEvent(d, { type: "CLOSED", at: "2026-09-18T23:00:00Z" });
    assert.equal(d.status, "CLOSED");
    assert.equal(d.closed_at, "2026-09-18T23:00:00Z");
  });

  it("rejects skipping the deposit step", () => {
    const d = createDistribution(DST, "prj_aurora_net", MINT, "8000");
    assert.throws(() =>
      applyDistributionEvent(d, { type: "ROOT_COMMITTED", allocation_root: "ab".repeat(32), total_recipients: 3 }),
    );
  });

  it("rejects claims before root commit", () => {
    assert.throws(() => applyDistributionEvent(funded(), { type: "CLAIMS_OPENED" }));
  });

  it("rejects double deposit confirmation", () => {
    assert.throws(() =>
      applyDistributionEvent(funded(), { type: "DEPOSIT_CONFIRMED", vault: "v", deposit_tx: "tx" }),
    );
  });

  it("rejects closing a LIVE-less distribution", () => {
    assert.throws(() => applyDistributionEvent(funded(), { type: "CLOSED" }));
  });

  it("rejects ROOT_COMMITTED with zero recipients", () => {
    assert.throws(() =>
      applyDistributionEvent(funded(), { type: "ROOT_COMMITTED", allocation_root: "ab".repeat(32), total_recipients: 0 }),
    );
  });
});

// ── Allocation conservation ────────────────────────────────────────────

describe("allocation conservation", () => {
  it("Σ allocation === total passes", () => {
    assert.doesNotThrow(() => assertAllocationConservation("8000", allocations()));
  });

  it("mismatched totals throw", () => {
    assert.throws(() => assertAllocationConservation("8001", allocations()));
  });

  it("empty allocation set against positive total throws", () => {
    assert.throws(() => assertAllocationConservation("8000", []));
  });
});

// ── Merkle proofs ──────────────────────────────────────────────────────

describe("merkle allocation format", () => {
  const allocs = allocations();
  const leaves = allocs.map(allocationLeaf);
  const tree = buildMerkleTree(leaves);

  it("root is 64-char hex and input-order independent", () => {
    assert.match(tree.root.toString("hex"), /^[0-9a-f]{64}$/);
    const shuffled = buildMerkleTree([...leaves].reverse());
    assert.equal(shuffled.root.toString("hex"), tree.root.toString("hex"));
  });

  it("valid proof verifies against root", () => {
    for (const leaf of leaves) {
      assert.ok(verifyMerkleProof(leaf, merkleProof(tree, leaf), tree.root));
    }
  });

  it("wrong wallet is rejected", () => {
    const tampered = allocationLeaf({ distribution_id: DST, wallet: "Imp0storWalletExample99999999999999999999999", amount: "4200" });
    assert.ok(!verifyMerkleProof(tampered, merkleProof(tree, leaves[0]!), tree.root));
  });

  it("wrong amount is rejected", () => {
    const tampered = allocationLeaf({ distribution_id: DST, wallet: allocs[0]!.wallet, amount: "999999" });
    assert.ok(!verifyMerkleProof(tampered, merkleProof(tree, leaves[0]!), tree.root));
  });

  it("invalid proof is rejected", () => {
    const proof = merkleProof(tree, leaves[0]!);
    const tamperedProof = [...proof];
    tamperedProof[0] = Buffer.from("00".repeat(32), "hex");
    assert.ok(!verifyMerkleProof(leaves[0]!, tamperedProof, tree.root));
  });

  it("cross-distribution proof replay is rejected", () => {
    const otherDst = allocationLeaf({ distribution_id: "dst_999", wallet: allocs[0]!.wallet, amount: "4200" });
    assert.ok(!verifyMerkleProof(otherDst, merkleProof(tree, leaves[0]!), tree.root));
  });

  it("duplicate leaves throw at build time", () => {
    assert.throws(() => buildMerkleTree([leaves[0]!, leaves[0]!]));
  });
});
