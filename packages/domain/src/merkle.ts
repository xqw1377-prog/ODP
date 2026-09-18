import { createHash } from "node:crypto";
import type { Allocation } from "./distribution.js";

/**
 * ODP Merkle allocation format — **MERKLE-WIRE-FORMAT = PROVISIONAL**.
 * Not frozen until the TypeScript and Rust/Solana implementations produce
 * identical cross-language test vectors (leaf bytes, leaf hash, tree root,
 * proof, verification result) in P0-4 / G4. Do NOT swap SHA-256 for another
 * hash before measured CU data from the on-chain program justifies it.
 *
 *   leaf   = sha256(UTF8(distribution_id + "\n" + wallet + "\n" + amount))
 *   node   = sha256(concat(sort(child_a, child_b)))
 * Leaves are sorted by Buffer.compare before pairing (input order does not
 * affect the root); sibling sorting makes proofs direction-free; an odd
 * trailing node is promoted unchanged. Duplicate leaves are rejected.
 * distribution_id inside the leaf blocks cross-distribution proof replay.
 */
export function allocationLeaf(a: Pick<Allocation, "distribution_id" | "wallet" | "amount">): Buffer {
  return createHash("sha256")
    .update(`${a.distribution_id}\n${a.wallet}\n${a.amount}`, "utf8")
    .digest();
}

function hashPair(a: Buffer, b: Buffer): Buffer {
  const [x, y] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  return createHash("sha256").update(Buffer.concat([x, y])).digest();
}

export interface MerkleTree {
  root: Buffer;
  /** Leaves in tree (sorted) order. */
  leaves: Buffer[];
  /** levels[0] = sorted leaves; last level = [root]. */
  levels: Buffer[][];
}

export function buildMerkleTree(leaves: Buffer[]): MerkleTree {
  if (leaves.length === 0) throw new Error("merkle tree requires at least one leaf");

  const sorted = [...leaves].sort(Buffer.compare);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1]!.equals(sorted[i]!)) {
      throw new Error("duplicate merkle leaf (same wallet+amount appears twice)");
    }
  }

  const levels: Buffer[][] = [sorted];
  let level = sorted;
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      const b = i + 1 < level.length ? level[i + 1]! : null;
      next.push(b === null ? a : hashPair(a, b));
    }
    levels.push(next);
    level = next;
  }
  return { root: level[0]!, leaves: sorted, levels };
}

/** Proof for one leaf, identified by buffer equality against the sorted leaves. */
export function merkleProof(tree: MerkleTree, leaf: Buffer): Buffer[] {
  let index = tree.leaves.findIndex((l) => l.equals(leaf));
  if (index === -1) throw new Error("leaf not present in tree");

  const proof: Buffer[] = [];
  for (const level of tree.levels.slice(0, -1)) {
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    const sibling = siblingIndex < level.length ? level[siblingIndex]! : null;
    // Odd trailing node has no sibling — nothing to fold for this level.
    if (sibling !== null) proof.push(sibling);
    index = Math.floor(index / 2);
  }
  return proof;
}

/** Direction-free verification: fold leaf through the proof via sorted pairing. */
export function verifyMerkleProof(leaf: Buffer, proof: Buffer[], root: Buffer): boolean {
  let node = leaf;
  for (const p of proof) node = hashPair(node, p);
  return node.equals(root);
}
