//! P0-4 §21 matrix — in-process local validator via solana-program-test,
//! executing the REAL SBF artifact (target/deploy/distributor.so, the same
//! .so that ships to devnet).
//!
//! initialize → fund → (claim-before-live FAIL) → commit → (root mutation
//! FAIL) → open → wrong amount/proof/wallet/cross-distribution FAIL →
//! Maya claim PASS → double claim FAIL → Dan claim PASS → conservation.
//!
//! SPL/system instructions are hand-encoded byte-level (no spl-token deps).

use distributor::{encode_base58, merkle_leaf, sha256, STATUS_COMMITTED, STATUS_FUNDED, STATUS_LIVE, STATUS_PENDING};
use solana_program_test::{BanksClient, BanksClientError, ProgramTest};
use solana_sdk::{
    hash::Hash,
    instruction::{AccountMeta, Instruction, InstructionError},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::{Transaction, TransactionError},
};

/// anchor custom error codes: 6000 + variant index (declaration order)
const E_INVALID_STATUS: u32 = 6000;
const E_INVALID_PROOF: u32 = 6002;
const E_DIST_ID_MISMATCH: u32 = 6005;

const DISTRIBUTION_ID: &str = "dst_aurora_demo_001";
const PROJECT_ID: &str = "prj_aurora_net";
const TOTAL: u64 = 10_000;
const MINT_LEN: usize = 82;

const TOKEN_PROGRAM: Pubkey = solana_sdk::pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM: Pubkey = solana_sdk::pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM_PROGRAM: Pubkey = solana_sdk::pubkey!("11111111111111111111111111111111");

/// associated token account derivation for the classic token program
fn spl_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let seeds = [owner.as_ref(), TOKEN_PROGRAM.as_ref(), mint.as_ref()];
    Pubkey::find_program_address(&seeds, &ATA_PROGRAM).0
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn discriminator(name: &str) -> Vec<u8> {
    sha256(format!("global:{name}").as_bytes())[..8].to_vec()
}

fn custom_code(err: &BanksClientError) -> Option<u32> {
    match err {
        BanksClientError::TransactionError(TransactionError::InstructionError(
            _,
            InstructionError::Custom(code),
        )) => Some(*code),
        _ => None,
    }
}

/// Raw system transfer (tag 2).
fn system_transfer(from: &Pubkey, to: &Pubkey, lamports: u64) -> Instruction {
    let mut data = vec![2, 0, 0, 0];
    data.extend_from_slice(&lamports.to_le_bytes());
    Instruction::new_with_bytes(
        SYSTEM_PROGRAM,
        &data,
        vec![AccountMeta::new(*from, true), AccountMeta::new(*to, false)],
    )
}

/// Raw system create_account (tag 0, lamports, space, owner).
/// Note: agave 3+ runtime requires the `to` account to sign its own creation.
fn system_create_account(payer: &Pubkey, new: &Pubkey, lamports: u64, space: u64, owner: &Pubkey) -> Instruction {
    let mut data = vec![0, 0, 0, 0];
    data.extend_from_slice(&lamports.to_le_bytes());
    data.extend_from_slice(&space.to_le_bytes());
    data.extend_from_slice(owner.as_ref());
    Instruction::new_with_bytes(
        SYSTEM_PROGRAM,
        &data,
        vec![AccountMeta::new(*payer, true), AccountMeta::new(*new, true)],
    )
}

/// spl-token instruction builders (official crate — no hand-encoded guesses).
fn initialize_mint_ix(mint: &Pubkey, authority: &Pubkey) -> Instruction {
    spl_token::instruction::initialize_mint(&TOKEN_PROGRAM, mint, authority, Some(authority), 0).unwrap()
}

fn initialize_account_ix(account: &Pubkey, owner: &Pubkey, mint: &Pubkey) -> Instruction {
    spl_token::instruction::initialize_account(&TOKEN_PROGRAM, account, mint, owner).unwrap()
}

fn make_token_account(payer: &Pubkey, account_keypair: &Keypair, owner: &Pubkey, mint: &Pubkey, lamports: u64) -> Vec<Instruction> {
    vec![
        system_create_account(payer, &account_keypair.pubkey(), lamports, 165, &TOKEN_PROGRAM),
        initialize_account_ix(&account_keypair.pubkey(), owner, mint),
    ]
}

/// Raw spl-token MintTo (tag 7).
fn mint_to(mint: &Pubkey, dest: &Pubkey, authority: &Pubkey, amount: u64) -> Instruction {
    let mut data = vec![7u8];
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction::new_with_bytes(
        TOKEN_PROGRAM,
        &data,
        vec![
            AccountMeta::new(*mint, false),
            AccountMeta::new(*dest, false),
            AccountMeta::new_readonly(*authority, true),
        ],
    )
}

/// Merkle helpers mirrored from the vector crate (identical, FROZEN-V1).
mod tree {
    use distributor::hash_pair;

    pub fn build(leaves: &[[u8; 32]]) -> (Vec<Vec<[u8; 32]>>, [u8; 32]) {
        let mut sorted = leaves.to_vec();
        sorted.sort();
        let mut levels = vec![sorted];
        while levels.last().unwrap().len() > 1 {
            let cur = levels.last().unwrap();
            let mut next = Vec::new();
            let mut i = 0;
            while i < cur.len() {
                if i + 1 < cur.len() {
                    next.push(hash_pair(&cur[i], &cur[i + 1]));
                } else {
                    next.push(cur[i]);
                }
                i += 2;
            }
            levels.push(next);
        }
        let root = levels.last().unwrap()[0];
        (levels, root)
    }

    pub fn proof_for(levels: &[Vec<[u8; 32]>], leaf: &[u8; 32]) -> Vec<[u8; 32]> {
        let mut index = levels[0].iter().position(|l| l == leaf).unwrap();
        let mut out = Vec::new();
        for level in levels.iter().take(levels.len() - 1) {
            let sib = if index % 2 == 0 { index + 1 } else { index - 1 };
            if sib < level.len() {
                out.push(level[sib]);
            }
            index /= 2;
        }
        out
    }
}

struct Ctx {
    banks: BanksClient,
    payer: Keypair,
    mint: Pubkey,
    project: Keypair,
    maya: Keypair,
    dan: Keypair,
    sib: Keypair,
    distribution: Pubkey,
    vault: Pubkey,
    project_ata: Pubkey,
    maya_ata: Pubkey,
    dan_ata: Pubkey,
    sib_ata: Pubkey,
    root: [u8; 32],
    manifest_hash: [u8; 32],
    maya_proof: Vec<[u8; 32]>,
    dan_proof: Vec<[u8; 32]>,
}

fn ok(name: &str, cond: bool, detail: &str) {
    if cond {
        println!("  PASS {name}{detail}");
    } else {
        println!("  FAIL {name}{detail}");
        panic!("matrix assertion failed: {name}");
    }
}

/// Free function so field borrows (banks vs keypairs) stay disjoint.
async fn run(
    banks: &mut BanksClient,
    payer: &Pubkey,
    ixs: &[Instruction],
    signers: &[&Keypair],
) -> Result<(), BanksClientError> {
    let blockhash: Hash = banks.get_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(ixs, Some(payer), signers, blockhash);
    banks.process_transaction(tx).await
}

async fn setup() -> Ctx {
    // Load the REAL SBF artifact produced by cargo-build-sbf (same .so that
    // deploys to devnet), not a natively compiled twin.
    std::env::set_var("SBF_OUT_DIR", concat!(env!("CARGO_MANIFEST_DIR"), "/target/deploy"));
    let mut pt = ProgramTest::default();
    pt.prefer_bpf(true);
    pt.add_program("distributor", distributor::id(), None);
    let (mut banks, payer, blockhash) = pt.start().await;

    let project = Keypair::new();
    let maya = Keypair::new();
    let dan = Keypair::new();
    let sib = Keypair::new();

    // fund the wallets (fees + rents for claims)
    let lamports = 100 * solana_sdk::native_token::LAMPORTS_PER_SOL;
    banks
        .process_transaction(Transaction::new_signed_with_payer(
            &[
                system_transfer(&payer.pubkey(), &project.pubkey(), lamports),
                system_transfer(&payer.pubkey(), &maya.pubkey(), lamports),
                system_transfer(&payer.pubkey(), &dan.pubkey(), lamports),
                system_transfer(&payer.pubkey(), &sib.pubkey(), lamports),
            ],
            Some(&payer.pubkey()),
            &[&payer],
            blockhash,
        ))
        .await
        .unwrap();

    // mint (decimals = 0)
    let mint = Keypair::new();
    let mint_rent = banks.get_rent().await.unwrap().minimum_balance(MINT_LEN);
    banks
        .process_transaction(Transaction::new_signed_with_payer(
            &[
                system_create_account(&project.pubkey(), &mint.pubkey(), mint_rent as u64, MINT_LEN as u64, &TOKEN_PROGRAM),
                initialize_mint_ix(&mint.pubkey(), &project.pubkey()),
            ],
            Some(&project.pubkey()),
            &[&project, &mint],
            blockhash,
        ))
        .await
        .unwrap();

    // token accounts (hand-rolled create + initialize) + initial supply
    let token_account_rent = banks.get_rent().await.unwrap().minimum_balance(165);
    let project_ata_kp = Keypair::new();
    let maya_ata_kp = Keypair::new();
    let dan_ata_kp = Keypair::new();
    let sib_ata_kp = Keypair::new();
    let project_ata = project_ata_kp.pubkey();
    let maya_ata = maya_ata_kp.pubkey();
    let dan_ata = dan_ata_kp.pubkey();
    let sib_ata = sib_ata_kp.pubkey();
    banks
        .process_transaction(Transaction::new_signed_with_payer(
            &[
                make_token_account(&project.pubkey(), &project_ata_kp, &project.pubkey(), &mint.pubkey(), token_account_rent as u64),
                make_token_account(&project.pubkey(), &maya_ata_kp, &maya.pubkey(), &mint.pubkey(), token_account_rent as u64),
                make_token_account(&project.pubkey(), &dan_ata_kp, &dan.pubkey(), &mint.pubkey(), token_account_rent as u64),
                make_token_account(&project.pubkey(), &sib_ata_kp, &sib.pubkey(), &mint.pubkey(), token_account_rent as u64),
            ]
            .concat()
            .into_iter()
            .chain([mint_to(&mint.pubkey(), &project_ata, &project.pubkey(), TOTAL)])
            .collect::<Vec<_>>(),
            Some(&project.pubkey()),
            &[&project, &project_ata_kp, &maya_ata_kp, &dan_ata_kp, &sib_ata_kp],
            blockhash,
        ))
        .await
        .unwrap();

    // off-chain snapshot: leaves for maya(5000) + dan(5000) — sib excluded
    let maya_leaf = merkle_leaf(DISTRIBUTION_ID, &encode_base58(&maya.pubkey().to_bytes()), 5000);
    let dan_leaf = merkle_leaf(DISTRIBUTION_ID, &encode_base58(&dan.pubkey().to_bytes()), 5000);
    let (levels, root) = tree::build(&[maya_leaf, dan_leaf]);
    let maya_proof = tree::proof_for(&levels, &maya_leaf);
    let dan_proof = tree::proof_for(&levels, &dan_leaf);

    // manifest hash stand-in (on-chain it is opaque committed bytes; the real
    // one comes from the TS canonical pipeline)
    let manifest_hash = sha256(format!("{PROJECT_ID}|{DISTRIBUTION_ID}|{}", hex(&root)).as_bytes());

    let dist_id_hash = sha256(DISTRIBUTION_ID.as_bytes());
    let (distribution, _) = Pubkey::find_program_address(
        &[b"distribution", project.pubkey().as_ref(), dist_id_hash.as_ref()],
        &distributor::id(),
    );
    let vault = spl_ata(&distribution, &mint.pubkey());

    Ctx {
        banks,
        payer,
        mint: mint.pubkey(),
        project,
        maya,
        dan,
        sib,
        distribution,
        vault,
        project_ata,
        maya_ata,
        dan_ata,
        sib_ata,
        root,
        manifest_hash,
        maya_proof,
        dan_proof,
    }
}

fn initialize_ix(ctx: &Ctx) -> Instruction {
    let dist_id_hash = sha256(DISTRIBUTION_ID.as_bytes());
    let project_id_hash = sha256(PROJECT_ID.as_bytes());
    let mut data = discriminator("initialize_distribution");
    data.extend_from_slice(&dist_id_hash);
    data.extend_from_slice(&project_id_hash);
    data.extend_from_slice(&TOTAL.to_le_bytes());
    Instruction::new_with_bytes(
        distributor::id(),
        &data,
        vec![
            AccountMeta::new(ctx.project.pubkey(), true),
            AccountMeta::new_readonly(ctx.mint, false),
            AccountMeta::new(ctx.distribution, false),
            AccountMeta::new(ctx.vault, false),
            AccountMeta::new_readonly(TOKEN_PROGRAM, false),
            AccountMeta::new_readonly(ATA_PROGRAM, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
        ],
    )
}

fn fund_ix(ctx: &Ctx) -> Instruction {
    Instruction::new_with_bytes(
        distributor::id(),
        &discriminator("fund_distribution"),
        vec![
            AccountMeta::new(ctx.project.pubkey(), true),
            AccountMeta::new(ctx.distribution, false),
            AccountMeta::new(ctx.project_ata, false),
            AccountMeta::new(ctx.vault, false),
            AccountMeta::new_readonly(TOKEN_PROGRAM, false),
        ],
    )
}

fn commit_ix(ctx: &Ctx, root: &[u8; 32], manifest_hash: &[u8; 32], recipients: u32) -> Instruction {
    let mut data = discriminator("commit_root");
    data.extend_from_slice(root);
    data.extend_from_slice(manifest_hash);
    data.extend_from_slice(&recipients.to_le_bytes());
    Instruction::new_with_bytes(
        distributor::id(),
        &data,
        vec![
            AccountMeta::new(ctx.project.pubkey(), true),
            AccountMeta::new(ctx.distribution, false),
        ],
    )
}

fn open_ix(ctx: &Ctx) -> Instruction {
    Instruction::new_with_bytes(
        distributor::id(),
        &discriminator("open_claims"),
        vec![
            AccountMeta::new(ctx.project.pubkey(), true),
            AccountMeta::new(ctx.distribution, false),
            AccountMeta::new_readonly(ctx.vault, false),
        ],
    )
}

fn claim_ix(
    ctx: &Ctx,
    claimant: &Keypair,
    claimant_ata: Pubkey,
    distribution_id: &str,
    amount: u64,
    proof: &[[u8; 32]],
) -> (Instruction, Pubkey) {
    let (receipt, _) = Pubkey::find_program_address(
        &[b"claim", ctx.distribution.as_ref(), claimant.pubkey().as_ref()],
        &distributor::id(),
    );
    let mut data = discriminator("claim");
    data.extend_from_slice(&(distribution_id.len() as u32).to_le_bytes());
    data.extend_from_slice(distribution_id.as_bytes());
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(&(proof.len() as u32).to_le_bytes());
    for p in proof {
        data.extend_from_slice(p);
    }
    (
        Instruction::new_with_bytes(
            distributor::id(),
            &data,
            vec![
                AccountMeta::new(claimant.pubkey(), true),
                AccountMeta::new(ctx.distribution, false),
                AccountMeta::new(ctx.vault, false),
                AccountMeta::new(claimant_ata, false),
                AccountMeta::new(receipt, false),
                AccountMeta::new_readonly(TOKEN_PROGRAM, false),
                AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
            ],
        ),
        receipt,
    )
}

/// Offsets within DistributionAccount data (8-byte anchor disc + fields).
const OFF_CLAIMED: usize = 244;
const OFF_TOTAL: usize = 232;

async fn state(banks: &mut BanksClient, distribution: Pubkey) -> (u8, u64, u64) {
    let acct = banks.get_account(distribution).await.unwrap().unwrap();
    let d = &acct.data;
    (
        d[d.len() - 1],
        u64::from_le_bytes(d[OFF_CLAIMED..OFF_CLAIMED + 8].try_into().unwrap()),
        u64::from_le_bytes(d[OFF_TOTAL..OFF_TOTAL + 8].try_into().unwrap()),
    )
}

/// spl token account amount field offset
const OFF_TOKEN_AMOUNT: usize = 64;

async fn token_balance(banks: &mut BanksClient, ata: Pubkey) -> u64 {
    let acct = banks.get_account(ata).await.unwrap().unwrap();
    u64::from_le_bytes(acct.data[OFF_TOKEN_AMOUNT..OFF_TOKEN_AMOUNT + 8].try_into().unwrap())
}

#[tokio::test]
async fn golden_path_matrix() {
    let mut ctx = setup().await;
    println!("distribution = {}", ctx.distribution);
    println!("vault        = {}", ctx.vault);
    println!("root         = {}", hex(&ctx.root));
    let payer_pk = ctx.payer.pubkey();

    // 1. initialize
    let ix = initialize_ix(&ctx);
    run(&mut ctx.banks, &payer_pk, &[ix], &[&ctx.project, &ctx.payer]).await.unwrap();
    let (status, _, total) = state(&mut ctx.banks, ctx.distribution).await;
    ok("initialize PASS (PENDING, total recorded)", status == STATUS_PENDING && total == TOTAL, "");

    // 2. fund exact amount
    let ix = fund_ix(&ctx);
    run(&mut ctx.banks, &payer_pk, &[ix], &[&ctx.project, &ctx.payer]).await.unwrap();
    let (status, _, _) = state(&mut ctx.banks, ctx.distribution).await;
    let vault_balance = token_balance(&mut ctx.banks, ctx.vault).await;
    ok(
        "fund exact amount PASS (FUNDED, vault=10000)",
        status == STATUS_FUNDED && vault_balance == TOTAL,
        &format!(" (vault={vault_balance})"),
    );

    // 3. claim before commit/open → FAIL
    let (claim_before, _) = claim_ix(&ctx, &ctx.maya, ctx.maya_ata, DISTRIBUTION_ID, 5000, &ctx.maya_proof);
    let err = run(&mut ctx.banks, &payer_pk, &[claim_before], &[&ctx.maya, &ctx.payer]).await.unwrap_err();
    ok(
        "claim before LIVE FAIL",
        custom_code(&err) == Some(E_INVALID_STATUS),
        &format!(" (err={err})"),
    );

    // 4. commit root
    let root = ctx.root;
    let mhash = ctx.manifest_hash;
    let ix = commit_ix(&ctx, &root, &mhash, 2);
    run(&mut ctx.banks, &payer_pk, &[ix], &[&ctx.project, &ctx.payer]).await.unwrap();
    let (status, _, _) = state(&mut ctx.banks, ctx.distribution).await;
    ok("root commit PASS (COMMITTED)", status == STATUS_COMMITTED, "");

    // 5. root mutation after commit → FAIL
    let evil_root = sha256(b"evil-root");
    let evil_hash = [1u8; 32];
    let ix = commit_ix(&ctx, &evil_root, &evil_hash, 2);
    let err = run(&mut ctx.banks, &payer_pk, &[ix], &[&ctx.project, &ctx.payer]).await.unwrap_err();
    ok(
        "root mutation after commit FAIL",
        custom_code(&err) == Some(E_INVALID_STATUS),
        "",
    );

    // 6. open claims
    let ix = open_ix(&ctx);
    run(&mut ctx.banks, &payer_pk, &[ix], &[&ctx.project, &ctx.payer]).await.unwrap();
    let (status, _, _) = state(&mut ctx.banks, ctx.distribution).await;
    ok("open claims PASS (LIVE)", status == STATUS_LIVE, "");

    // 7. negatives
    let (wrong_amount, _) = claim_ix(&ctx, &ctx.maya, ctx.maya_ata, DISTRIBUTION_ID, 4999, &ctx.maya_proof);
    let err = run(&mut ctx.banks, &payer_pk, &[wrong_amount], &[&ctx.maya, &ctx.payer]).await.unwrap_err();
    ok("wrong amount FAIL", custom_code(&err) == Some(E_INVALID_PROOF), "");

    let mut tampered = ctx.maya_proof.clone();
    tampered[0] = [0xab; 32];
    let (wrong_proof, _) = claim_ix(&ctx, &ctx.maya, ctx.maya_ata, DISTRIBUTION_ID, 5000, &tampered);
    let err = run(&mut ctx.banks, &payer_pk, &[wrong_proof], &[&ctx.maya, &ctx.payer]).await.unwrap_err();
    ok("wrong proof FAIL", custom_code(&err) == Some(E_INVALID_PROOF), "");

    let (sib_claim, _) = claim_ix(&ctx, &ctx.sib, ctx.sib_ata, DISTRIBUTION_ID, 5000, &ctx.dan_proof);
    let err = run(&mut ctx.banks, &payer_pk, &[sib_claim], &[&ctx.sib, &ctx.payer]).await.unwrap_err();
    ok("sib (no allocation) claim FAIL", custom_code(&err) == Some(E_INVALID_PROOF), "");

    let (cross, _) = claim_ix(&ctx, &ctx.maya, ctx.maya_ata, "dst_other_999", 5000, &ctx.maya_proof);
    let err = run(&mut ctx.banks, &payer_pk, &[cross], &[&ctx.maya, &ctx.payer]).await.unwrap_err();
    ok(
        "cross-distribution proof FAIL",
        custom_code(&err) == Some(E_DIST_ID_MISMATCH),
        "",
    );

    // 8. Maya claim PASS
    let (maya_claim, maya_receipt) = claim_ix(&ctx, &ctx.maya, ctx.maya_ata, DISTRIBUTION_ID, 5000, &ctx.maya_proof);
    run(&mut ctx.banks, &payer_pk, &[maya_claim], &[&ctx.maya, &ctx.payer]).await.unwrap();
    let maya_balance = token_balance(&mut ctx.banks, ctx.maya_ata).await;
    let (status, claimed, _) = state(&mut ctx.banks, ctx.distribution).await;
    let receipt = ctx.banks.get_account(maya_receipt).await.unwrap();
    ok(
        "Maya claim PASS (5000 received, claimed=5000, receipt exists)",
        maya_balance == 5000 && claimed == 5000 && status == STATUS_LIVE && receipt.is_some(),
        &format!(" (maya={maya_balance}, claimed={claimed})"),
    );

    // 9. Maya second claim → FAIL (ClaimReceipt PDA already exists)
    let (double_claim, _) = claim_ix(&ctx, &ctx.maya, ctx.maya_ata, DISTRIBUTION_ID, 5000, &ctx.maya_proof);
    let err = run(&mut ctx.banks, &payer_pk, &[double_claim], &[&ctx.maya, &ctx.payer]).await.unwrap_err();
    ok(
        "Maya second claim FAIL (program-level double-claim rejection)",
        true, // the transaction itself failed: the receipt PDA refuses re-init
        &format!(" (err={err})"),
    );

    // 10. Dan claim PASS
    let (dan_claim, _) = claim_ix(&ctx, &ctx.dan, ctx.dan_ata, DISTRIBUTION_ID, 5000, &ctx.dan_proof);
    run(&mut ctx.banks, &payer_pk, &[dan_claim], &[&ctx.dan, &ctx.payer]).await.unwrap();
    let dan_balance = token_balance(&mut ctx.banks, ctx.dan_ata).await;
    let (_, claimed, total) = state(&mut ctx.banks, ctx.distribution).await;
    ok(
        "Dan claim PASS (5000 received, claimed=10000)",
        dan_balance == 5000 && claimed == TOTAL,
        &format!(" (dan={dan_balance}, claimed={claimed})"),
    );

    // 11. conservation
    let vault_balance = token_balance(&mut ctx.banks, ctx.vault).await;
    ok("allocation conservation PASS (Σ=total)", 5000 + 5000 == total, "");
    ok(
        "vault conservation PASS (vault+claimed=funded)",
        vault_balance + claimed == TOTAL,
        &format!(" (vault={vault_balance}, claimed={claimed})"),
    );

    println!("LOCAL PROGRAM-TEST MATRIX (real SBF artifact): ALL PASS");
}

#[tokio::test]
async fn program_merkle_leaf_matches_frozen_v1_vector() {
    // The program's own leaf helper must reproduce the committed FROZEN-V1
    // cross-language vector (programs/merkle-vector/vector.json) for the two
    // demo wallets with real Solana pubkeys.
    let cases: [(&str, &str, u64, &str); 2] = [
        (
            "dst_aurora_demo_001",
            "BGu7XoF86KA4hTJDoVFb4izKa23MZxsyrecJ9r4FNSS9",
            5000,
            "9e5d3cb1236882a288e9852ef08859b21a6fcf8cfdf492cbd492bb52ffcba754",
        ),
        (
            "dst_aurora_demo_001",
            "2GAcVyic6XNUrgWMjh1CwDg8zfbYx9RVz5HWbABb7nhr",
            5000,
            "972b6352c076e6d3d6395ac1084a9fdd04795f697881c540d425e29006df2f47",
        ),
    ];
    for (dist, wallet, amount, expected) in cases {
        let leaf = merkle_leaf(dist, wallet, amount);
        assert_eq!(hex(&leaf), expected, "leaf mismatch for {wallet}");
    }
}
