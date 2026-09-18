//! Rust mirror of the ODP merkle wire format (must stay byte-identical to
//! packages/domain/src/merkle.ts):
//!   leaf = sha256(utf8(distribution_id + "\n" + wallet + "\n" + amount))
//!   node = sha256(concat(sort(child_a, child_b)))
//! Leaves sorted before pairing; sibling sorting makes proofs
//! direction-free; odd trailing node promoted unchanged.

use crate::sha256::sha256;

pub fn leaf(distribution_id: &str, wallet: &str, amount: &str) -> [u8; 32] {
    let preimage = format!("{}\n{}\n{}", distribution_id, wallet, amount);
    sha256(preimage.as_bytes())
}

fn hash_pair(a: &[u8], b: &[u8]) -> [u8; 32] {
    let (x, y) = if a <= b { (a, b) } else { (b, a) };
    let mut buf = Vec::with_capacity(x.len() + y.len());
    buf.extend_from_slice(x);
    buf.extend_from_slice(y);
    sha256(&buf)
}

pub struct Tree {
    pub root: [u8; 32],
    pub leaves: Vec<[u8; 32]>,
    pub levels: Vec<Vec<[u8; 32]>>,
}

pub fn build(leaves: &[[u8; 32]]) -> Tree {
    assert!(!leaves.is_empty(), "merkle tree requires at least one leaf");
    let mut sorted = leaves.to_vec();
    sorted.sort();
    for i in 1..sorted.len() {
        assert!(sorted[i - 1] != sorted[i], "duplicate merkle leaf");
    }

    let mut levels: Vec<Vec<[u8; 32]>> = vec![sorted.clone()];
    while levels.last().unwrap().len() > 1 {
        let level = levels.last().unwrap();
        let mut next: Vec<[u8; 32]> = Vec::with_capacity((level.len() + 1) / 2);
        let mut i = 0;
        while i < level.len() {
            if i + 1 < level.len() {
                next.push(hash_pair(&level[i], &level[i + 1]));
            } else {
                next.push(level[i]);
            }
            i += 2;
        }
        levels.push(next);
    }

    Tree {
        root: levels.last().unwrap()[0],
        leaves: sorted,
        levels,
    }
}

pub fn proof(tree: &Tree, leaf_bytes: &[u8; 32]) -> Vec<[u8; 32]> {
    let mut index = tree
        .leaves
        .iter()
        .position(|l| l == leaf_bytes)
        .expect("leaf not present in tree");
    let mut out: Vec<[u8; 32]> = Vec::new();
    for level in tree.levels.iter().take(tree.levels.len() - 1) {
        let sibling_index = if index % 2 == 0 { index + 1 } else { index - 1 };
        if sibling_index < level.len() {
            out.push(level[sibling_index]);
        }
        index /= 2;
    }
    out
}

pub fn verify(leaf_bytes: &[u8; 32], proof: &[[u8; 32]], root: &[u8; 32]) -> bool {
    let mut node = *leaf_bytes;
    for p in proof {
        node = hash_pair(&node, p);
    }
    &node == root
}
