//! ODP merkle wire-format cross-language checker.
//! Recomputes every value in the generated vector from raw inputs and
//! demands byte-identical results with the TypeScript implementation.
//! Exit code != 0 on any mismatch.

mod merkle;
mod sha256;
mod vector_data;

use merkle::{build, leaf, proof, verify};
use sha256::{hex, unhex};

fn main() {
    let mut failures = 0u32;

    // 1. Recompute leaves from preimages.
    let mut leaves: Vec<[u8; 32]> = Vec::new();
    for e in vector_data::ENTRIES {
        let computed_preimage = format!(
            "{}\n{}\n{}",
            vector_data::DISTRIBUTION_ID, e.wallet, e.amount
        );
        if computed_preimage != e.leaf_preimage {
            println!("FAIL preimage mismatch for {}", e.wallet);
            failures += 1;
        }
        let l = leaf(vector_data::DISTRIBUTION_ID, e.wallet, e.amount);
        if hex(&l) != e.leaf_hash_hex {
            println!(
                "FAIL leaf hash mismatch for {}: rust={} ts={}",
                e.wallet,
                hex(&l),
                e.leaf_hash_hex
            );
            failures += 1;
        }
        leaves.push(l);
    }

    // 2. Rebuild the tree and compare the root.
    let tree = build(&leaves);
    let root_hex = hex(&tree.root);
    if root_hex != vector_data::ROOT_HEX {
        println!("FAIL root mismatch: rust={} ts={}", root_hex, vector_data::ROOT_HEX);
        failures += 1;
    }

    // 3. Regenerate proofs and verify.
    for (i, e) in vector_data::ENTRIES.iter().enumerate() {
        let p = proof(&tree, &leaves[i]);
        let p_hex: Vec<String> = p.iter().map(|b| hex(b)).collect();
        if p_hex != e.proof_hex {
            println!("FAIL proof mismatch for {}", e.wallet);
            failures += 1;
        }
        if !verify(&leaves[i], &p, &tree.root) {
            println!("FAIL positive verify for {}", e.wallet);
            failures += 1;
        }
    }

    // 4. Negatives: replay entry-0's proof against tampered leaves.
    let maya_proof: Vec<[u8; 32]> = vector_data::ENTRIES[0]
        .proof_hex
        .iter()
        .map(|s| {
            let v = unhex(s);
            let mut a = [0u8; 32];
            a.copy_from_slice(&v);
            a
        })
        .collect();
    for n in vector_data::NEGATIVES {
        let l = leaf(n.distribution_id, n.wallet, n.amount);
        if hex(&l) != n.expected_leaf_hash_hex {
            println!("FAIL negative leaf mismatch for {}", n.case_name);
            failures += 1;
        }
        if verify(&l, &maya_proof, &tree.root) {
            println!("FAIL negative case {} verified (must be false)", n.case_name);
            failures += 1;
        }
    }

    println!("distribution_id : {}", vector_data::DISTRIBUTION_ID);
    println!("root (rust)     : {}", root_hex);
    println!("root (ts)       : {}", vector_data::ROOT_HEX);
    println!("entries checked : {}", vector_data::ENTRIES.len());
    println!("negatives       : {}", vector_data::NEGATIVES.len());
    if failures == 0 {
        println!("CROSS-LANGUAGE MERKLE VECTOR: IDENTICAL");
    } else {
        println!("CROSS-LANGUAGE MERKLE VECTOR: {} FAILURES", failures);
        std::process::exit(1);
    }
}
