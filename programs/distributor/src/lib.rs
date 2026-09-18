//! ODP Distributor — the on-chain half of the P0-4 Golden Path.
//!
//! Lifecycle (mirrors the off-chain state machine in @odp/domain):
//!   PENDING --fund--> FUNDED --commit_root--> COMMITTED --open_claims--> LIVE
//!
//! Guarantees:
//!   - The vault is an ATA owned by the distribution PDA: after commit the
//!     project CANNOT move tokens around the program.
//!   - allocation_root is committed exactly once (commit only legal from
//!     FUNDED) and never mutable afterwards.
//!   - Claims verify the merkle proof on-chain against the committed root;
//!     the leaf is recomputed from (distribution_id, claimant pubkey, amount)
//!     so wrong wallet / wrong amount / wrong distribution all fail.
//!   - Double claims are impossible at the PROGRAM level: the ClaimReceipt
//!     PDA exists after the first claim, so `init` fails on any retry.
//!   - claimed_amount <= total_amount always (checked_add + cap), giving
//!     vault balance + claimed = funded conservation on the Golden Path.
//!   - There is deliberately NO admin withdraw / sweep / emergency-take-all.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

declare_id!("GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW");

pub const DISTRIBUTION_SEED: &[u8] = b"distribution";
pub const CLAIM_SEED: &[u8] = b"claim";

pub const STATUS_PENDING: u8 = 0;
pub const STATUS_FUNDED: u8 = 1;
pub const STATUS_COMMITTED: u8 = 2;
pub const STATUS_LIVE: u8 = 3;

pub const DISTRIBUTION_SPACE: usize = 8 + 32 * 7 + 8 + 4 + 8 + 1;
pub const CLAIM_RECEIPT_SPACE: usize = 8 + 32 + 32 + 8 + 8;

#[error_code]
pub enum ErrorCode {
    #[msg("distribution status does not allow this operation")]
    InvalidStatus,
    #[msg("vault balance is below the required amount")]
    Underfunded,
    #[msg("merkle proof verification failed")]
    InvalidProof,
    #[msg("claim would exceed the committed total")]
    OverClaim,
    #[msg("signer is not the project authority")]
    NotAuthority,
    #[msg("distribution_id does not match the committed hash")]
    DistributionIdMismatch,
    #[msg("token mint mismatch")]
    MintMismatch,
}

#[account]
pub struct DistributionAccount {
    pub project_authority: Pubkey,
    pub token_mint: Pubkey,
    pub vault: Pubkey,
    pub distribution_id_hash: [u8; 32],
    pub project_id_hash: [u8; 32],
    pub allocation_root: [u8; 32],
    pub manifest_hash: [u8; 32],
    pub total_amount: u64,
    pub total_recipients: u32,
    pub claimed_amount: u64,
    /// STATUS_PENDING | STATUS_FUNDED | STATUS_COMMITTED | STATUS_LIVE
    pub status: u8,
}

#[account]
pub struct ClaimReceipt {
    pub distribution: Pubkey,
    pub claimant: Pubkey,
    pub amount: u64,
    pub claimed_at: i64,
}

#[event]
pub struct DistributionInitialized {
    pub distribution: Pubkey,
    pub project_authority: Pubkey,
    pub token_mint: Pubkey,
    pub vault: Pubkey,
    pub distribution_id_hash: [u8; 32],
    pub project_id_hash: [u8; 32],
    pub total_amount: u64,
}

#[event]
pub struct DistributionFunded {
    pub distribution: Pubkey,
    pub vault: Pubkey,
    pub funded_amount: u64,
    pub fund_tx_authority: Pubkey,
}

#[event]
pub struct RootCommitted {
    pub distribution: Pubkey,
    pub allocation_root: [u8; 32],
    pub manifest_hash: [u8; 32],
    pub total_recipients: u32,
}

#[event]
pub struct ClaimsOpened {
    pub distribution: Pubkey,
    pub vault_balance: u64,
}

#[event]
pub struct Claimed {
    pub distribution: Pubkey,
    pub claimant: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub allocation_root: [u8; 32],
}

// ── Merkle wire format (FROZEN-V1, identical to TS/Rust vectors) ────────

/// Public for the integration test + external verifiers.
pub fn sha256(data: &[u8]) -> [u8; 32] {
    solana_program::hash::hash(data).to_bytes()
}

/// Public for the integration test + external verifiers.
pub fn hash_pair(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let (x, y) = if a <= b { (a, b) } else { (b, a) };
    let mut buf = [0u8; 64];
    buf[..32].copy_from_slice(x);
    buf[32..].copy_from_slice(y);
    sha256(&buf)
}

/// Public for the integration test + external verifiers.
pub fn merkle_leaf(distribution_id: &str, wallet: &str, amount: u64) -> [u8; 32] {
    let preimage = format!("{}\n{}\n{}", distribution_id, wallet, amount);
    sha256(preimage.as_bytes())
}

/// Public for the integration test + external verifiers.
pub fn verify_proof(leaf: &[u8; 32], proof: &[[u8; 32]], root: &[u8; 32]) -> bool {
    let mut node = *leaf;
    for p in proof {
        node = hash_pair(&node, p);
    }
    node == *root
}

/// Base58 (Bitcoin alphabet) encoding of a pubkey, matching the TS fixture
/// wallet strings byte-for-byte. ~45 chars for 32 bytes.
/// Public for the integration test + external verifiers.
pub fn encode_base58(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mut digits: Vec<u8> = Vec::new();
    for &byte in bytes {
        let mut carry = byte as u32;
        for d in digits.iter_mut() {
            carry += (*d as u32) * 256;
            *d = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            digits.push((carry % 58) as u8);
            carry /= 58;
        }
    }
    let mut out = String::new();
    for &b in bytes {
        if b == 0 {
            out.push('1');
        } else {
            break;
        }
    }
    for &d in digits.iter().rev() {
        out.push(ALPHABET[d as usize] as char);
    }
    out
}

// ── Instructions ───────────────────────────────────────────────────────

#[program]
pub mod distributor {
    use super::*;

    /// Create the distribution PDA + PDA-owned vault ATA. Status: PENDING.
    pub fn initialize_distribution(
        ctx: Context<InitializeDistribution>,
        distribution_id_hash: [u8; 32],
        project_id_hash: [u8; 32],
        total_amount: u64,
    ) -> Result<()> {
        require!(total_amount > 0, ErrorCode::Underfunded);
        let d = &mut ctx.accounts.distribution;
        d.project_authority = ctx.accounts.authority.key();
        d.token_mint = ctx.accounts.token_mint.key();
        d.vault = ctx.accounts.vault.key();
        d.distribution_id_hash = distribution_id_hash;
        d.project_id_hash = project_id_hash;
        d.allocation_root = [0u8; 32];
        d.manifest_hash = [0u8; 32];
        d.total_amount = total_amount;
        d.total_recipients = 0;
        d.claimed_amount = 0;
        d.status = STATUS_PENDING;

        emit!(DistributionInitialized {
            distribution: d.key(),
            project_authority: d.project_authority,
            token_mint: d.token_mint,
            vault: d.vault,
            distribution_id_hash,
            project_id_hash,
            total_amount,
        });
        Ok(())
    }

    /// Transfer EXACTLY total_amount from the project's token account into
    /// the PDA vault. Status: PENDING -> FUNDED.
    pub fn fund_distribution(ctx: Context<FundDistribution>) -> Result<()> {
        let d = &mut ctx.accounts.distribution;
        require!(d.status == STATUS_PENDING, ErrorCode::InvalidStatus);
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                token::Transfer {
                    from: ctx.accounts.authority_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            d.total_amount,
        )?;
        // reload: the deserialized snapshot predates the CPI transfer
        ctx.accounts.vault.reload()?;
        require!(
            ctx.accounts.vault.amount >= d.total_amount,
            ErrorCode::Underfunded
        );
        d.status = STATUS_FUNDED;
        emit!(DistributionFunded {
            distribution: d.key(),
            vault: d.vault,
            funded_amount: d.total_amount,
            fund_tx_authority: ctx.accounts.authority.key(),
        });
        Ok(())
    }

    /// Commit the merkle root + manifest hash + recipient count. Only legal
    /// from FUNDED — the root can therefore be committed exactly once and
    /// is immutable afterwards (no instruction path modifies it).
    pub fn commit_root(
        ctx: Context<CommitRoot>,
        allocation_root: [u8; 32],
        manifest_hash: [u8; 32],
        total_recipients: u32,
    ) -> Result<()> {
        let d = &mut ctx.accounts.distribution;
        require!(d.status == STATUS_FUNDED, ErrorCode::InvalidStatus);
        require!(total_recipients >= 1, ErrorCode::InvalidStatus);
        d.allocation_root = allocation_root;
        d.manifest_hash = manifest_hash;
        d.total_recipients = total_recipients;
        d.status = STATUS_COMMITTED;
        emit!(RootCommitted {
            distribution: d.key(),
            allocation_root,
            manifest_hash,
            total_recipients,
        });
        Ok(())
    }

    /// Open claims. Only legal from COMMITTED; re-verifies vault funding.
    pub fn open_claims(ctx: Context<OpenClaims>) -> Result<()> {
        let d = &mut ctx.accounts.distribution;
        require!(d.status == STATUS_COMMITTED, ErrorCode::InvalidStatus);
        require!(
            ctx.accounts.vault.amount >= d.total_amount,
            ErrorCode::Underfunded
        );
        d.status = STATUS_LIVE;
        emit!(ClaimsOpened {
            distribution: d.key(),
            vault_balance: ctx.accounts.vault.amount,
        });
        Ok(())
    }

    /// Proof-verified claim. The leaf is RECOMPUTED on-chain from
    /// (distribution_id argument, claimant pubkey, amount) — the signer IS
    /// the wallet. The ClaimReceipt PDA is created here, so a second claim
    /// by the same wallet fails at account init (program-level rejection).
    pub fn claim(ctx: Context<Claim>, distribution_id: String, amount: u64, proof: Vec<[u8; 32]>) -> Result<()> {
        let d = &mut ctx.accounts.distribution;
        require!(d.status == STATUS_LIVE, ErrorCode::InvalidStatus);
        require!(amount > 0, ErrorCode::OverClaim);

        // The distribution_id argument must hash to the committed id hash —
        // cross-distribution proof replay dies here.
        let id_hash = sha256(distribution_id.as_bytes());
        require!(
            id_hash == d.distribution_id_hash,
            ErrorCode::DistributionIdMismatch
        );

        let wallet = encode_base58(&ctx.accounts.claimant.key().to_bytes());
        let leaf = merkle_leaf(&distribution_id, &wallet, amount);
        require!(
            verify_proof(&leaf, &proof, &d.allocation_root),
            ErrorCode::InvalidProof
        );

        let bump = ctx.bumps.distribution;
        let seeds = &[
            DISTRIBUTION_SEED,
            d.project_authority.as_ref(),
            d.distribution_id_hash.as_ref(),
            &[bump],
        ];
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                token::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.claimant_ata.to_account_info(),
                    authority: d.to_account_info(),
                },
            )
            .with_signer(&[seeds]),
            amount,
        )?;

        d.claimed_amount = d
            .claimed_amount
            .checked_add(amount)
            .ok_or(error!(ErrorCode::OverClaim))?;
        require!(d.claimed_amount <= d.total_amount, ErrorCode::OverClaim);

        let receipt = &mut ctx.accounts.claim_receipt;
        receipt.distribution = d.key();
        receipt.claimant = ctx.accounts.claimant.key();
        receipt.amount = amount;
        receipt.claimed_at = Clock::get()?.unix_timestamp;

        emit!(Claimed {
            distribution: d.key(),
            claimant: ctx.accounts.claimant.key(),
            token_mint: d.token_mint,
            amount,
            allocation_root: d.allocation_root,
        });
        Ok(())
    }
}

// ── Accounts contexts ──────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(distribution_id_hash: [u8; 32])]
pub struct InitializeDistribution<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = DISTRIBUTION_SPACE,
        seeds = [
            DISTRIBUTION_SEED,
            authority.key().as_ref(),
            distribution_id_hash.as_ref(),
        ],
        bump
    )]
    pub distribution: Account<'info, DistributionAccount>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = token_mint,
        associated_token::authority = distribution
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundDistribution<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = distribution.project_authority == authority.key() @ ErrorCode::NotAuthority,
        constraint = distribution.vault == vault.key()
    )]
    pub distribution: Account<'info, DistributionAccount>,
    #[account(
        mut,
        constraint = authority_token.mint == distribution.token_mint @ ErrorCode::MintMismatch,
        constraint = authority_token.owner == authority.key()
    )]
    pub authority_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = vault.mint == distribution.token_mint @ ErrorCode::MintMismatch)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CommitRoot<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = distribution.project_authority == authority.key() @ ErrorCode::NotAuthority
    )]
    pub distribution: Account<'info, DistributionAccount>,
}

#[derive(Accounts)]
pub struct OpenClaims<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = distribution.project_authority == authority.key() @ ErrorCode::NotAuthority
    )]
    pub distribution: Account<'info, DistributionAccount>,
    #[account(constraint = vault.key() == distribution.vault)]
    pub vault: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    #[account(
        mut,
        seeds = [
            DISTRIBUTION_SEED,
            distribution.project_authority.as_ref(),
            distribution.distribution_id_hash.as_ref(),
        ],
        bump
    )]
    pub distribution: Account<'info, DistributionAccount>,
    #[account(mut, constraint = vault.key() == distribution.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = claimant_ata.mint == distribution.token_mint @ ErrorCode::MintMismatch,
        constraint = claimant_ata.owner == claimant.key()
    )]
    pub claimant_ata: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = claimant,
        space = CLAIM_RECEIPT_SPACE,
        seeds = [CLAIM_SEED, distribution.key().as_ref(), claimant.key().as_ref()],
        bump
    )]
    pub claim_receipt: Account<'info, ClaimReceipt>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
