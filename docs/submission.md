# ODP · Hackathon Submission Copy

## One-liner

**Open Distribution Protocol — Token finds the human.** ODP discovers crypto
projects, establishes evidence-based trust, matches them with the right
humans, and distributes ownership on Solana — verifiably.

## Short description (≤100 words)

Every day, good crypto projects struggle to find real users while real users
drown in noise. ODP replaces paid reach with a protocol: projects are
discovered and audited into a six-dimension Project Passport (ALLOW / WATCH /
REJECT, derived from evidence — never declared, never bought); only ALLOW
projects enter matching, where real human behavior — not follower counts —
decides who is selected; allocations follow protocol policy; claims settle
on Solana Devnet with merkle proofs, program-level double-claim rejection,
and on-chain receipts. We demo the full loop live: Discover → Trust → Match →
Distribute, ending with a real browser claim confirmed on-chain.

## What we built (P0 scope, all verified)

| Layer | What it is | Evidence |
|---|---|---|
| Domain contract | 7 frozen schemas; status derived from evidence (derivation lock); strict identity binding; u64-safe amounts | full test suite green in CI; CI-enforced TS↔Rust merkle vector |
| Passport engine | Discovery → evidence assembly → six-dim passport → validated persistence (atomic writes, read-side tamper rejection) → radar/detail read models | `packages/passport-engine` |
| Matching engine | ALLOW hard gate; deterministic 4-factor score (interest fit 55 / human confidence 20 / reputation 15 / network 10); risk flags hard-block at 0; explainable reasons | `packages/matching-engine` |
| Solana distributor | Anchor program `GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW`: PDA vault, one-shot immutable root commit, on-chain merkle verify incl. base58 leaf recompute, ClaimReceipt PDA double-claim rejection, conservation, NO admin sweep | [devnet evidence](devnet-evidence-dst_aurora_devnet_003.md): 15/15 matrix incl. rejections |
| Demo layer | 4-scene web app over the real pipelines; demo-wallet claim signing server-side | [browser E2E evidence](browser-e2e-evidence-dst_aurora_demo_20260918150700.md): real Chrome click → fresh devnet tx `23Wh2oTs…` → Maya balance 5000 |
| **Pilot layer (P1)** | Non-custodial Early-Humans pipeline: one-time wallet-ownership challenge (server never holds human keys), consent + interests → ELIGIBLE; operator-verified evidence → derived passport; generic pilot runner; self-custody claim flow; aggregate-only evidence export | **PILOT-0 = PASS-E2E / REAL-HUMAN / DEVNET** — first real-human self-custody claim: [PILOT0_VERDICT](PILOT0_VERDICT.md) · claim tx [explorer `i2GHXp4y…`](https://explorer.solana.com/tx/i2GHXp4yDwnru4cjmyWaXu2PT1uM5v3EPtFi8X5TmdkYDTnLoMPEmABURN9xobonszt1m94U4nNZK8jiiApFQwD?cluster=devnet) · ClaimReceipt [explorer `3J1onUTn…`](https://explorer.solana.com/account/3J1onUTnG5RBp6o5b1nCtdD4kVLWVnQXReQQVdtnCuLj?cluster=devnet) · aggregate ledger [pilot-evidence-…](pilot-evidence-run_odp_pilot_one_20260919150045.md) |

## The three invariants (product principles, enforced in code)

1. **Status is derived, never declared.** A passport whose ruling disagrees
   with its evidence cannot even be persisted.
2. **Identity is bound, never implied.** Candidate = evidence = passport =
   store key = filename; mismatch fails closed.
3. **Match score is not token entitlement.** Maya 0.942 and Dan 0.491 each
   receive 5,000 — matching decides eligibility, policy decides amount.

## Architecture in one glance

```text
Discover (fixtures/seed → candidates)
   ↓
Trust    (six-dim evidence → derivePassportRuling → ALLOW/WATCH/REJECT)
   ↓
Match    (ALLOW gate → deterministic 4-factor score → ranked humans + reasons)
   ↓
Distribute (equal-split policy → merkle tree → Anchor program: vault →
            immutable root → LIVE → proof-verified claims → receipts)
```

Off-chain: TypeScript (6 workspace packages, full test suite green in CI incl.
cross-language merkle vector). On-chain: Anchor 1.2 / Agave 4.2.2 Devnet.
Full details: [docs/architecture.md](architecture.md),
[README](../README.md).

## Evidence in three levels

**LEVEL 1 — DETERMINISTIC PROTOCOL**
Passport / Matching / Distribution engines; full test suite green in CI; frozen invariants (derivation lock, identity binding, Merkle wire format).

**LEVEL 2 — REAL SOLANA EXECUTION**
Anchor distributor `GRgiEJUG…yFeW`; Devnet 15/15 attack matrix incl. rejection paths; real-browser E2E; ClaimReceipt double-claim rejection.

**LEVEL 3 — REAL HUMAN EVIDENCE (PILOT-0)**
own Phantom · wallet ownership proof (challenge signature) · ELIGIBLE · real allocation (1,000) · self-custody claim · on-chain receipt.
Claim tx: [explorer `i2GHXp4y…`](https://explorer.solana.com/tx/i2GHXp4yDwnru4cjmyWaXu2PT1uM5v3EPtFi8X5TmdkYDTnLoMPEmABURN9xobonszt1m94U4nNZK8jiiApFQwD?cluster=devnet) · ClaimReceipt: [explorer `3J1onUTn…`](https://explorer.solana.com/account/3J1onUTnG5RBp6o5b1nCtdD4kVLWVnQXReQQVdtnCuLj?cluster=devnet) · Verdict: [PILOT0_VERDICT](PILOT0_VERDICT.md) · Ledger: [pilot-evidence-…](pilot-evidence-run_odp_pilot_one_20260919150045.md)

## Canonical submission facts

(Single source of truth, shared by README / submission / PILOT0_VERDICT.)

```text
P0 HACKATHON BASELINE      = 90d7ef0
PILOT-0 EVIDENCE BASELINE  = 64942ea
SUBMISSION CODE BASELINE   = c26b401 (last code baseline before Submission Closeout; contains SUBMIT-P0-1 root fix)
REAL HUMAN                 = YES
REAL HUMAN TRACTION        = NOT YET
FIRST-PARTY PILOT          = YES
EXTERNAL PROJECT ADOPTION  = NOT YET
SOLANA DEVNET              = YES
PRODUCTION                 = NO
```

(Boundary facts live in the **Unified facts** block above — stated once, never drifted.)

## Live proof pointers

- Program: `GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW` (executable, devnet)
- Browser-click claim tx:
  [explorer.solana.com/tx/23Wh2oTs…SinijRx7n?cluster=devnet](https://explorer.solana.com/tx/23Wh2oTsGNcL9dnd4Ff7S5hZayU2rE3U5kRKV3sW3E4SE7s9kMvAPsTvMKa2yNTxTFcfZF8mV99aGSHSinijRx7n?cluster=devnet)
- Attack matrix on devnet (wrong wallet/amount/proof, cross-distribution,
  double claim — all rejected with logs):
  [devnet-evidence-dst_aurora_devnet_003.md](devnet-evidence-dst_aurora_devnet_003.md)
- Screenshots: [docs/screenshots/](screenshots/) (radar / passport / match /
  claim-before / claimed)

## Run it yourself

```bash
npm install && npm run build && npm test   # full suite green (see CI badge)
cd packages/web
npm run demo:prepare    # fresh devnet distribution → READY TO CLAIM
npm run dev             # http://127.0.0.1:3000/radar
```

## Videos

- Pitch (2–3 min): _link pending upload_ — final script: [docs/video/P0-3A-PRESENTATION-SCRIPT.md](video/P0-3A-PRESENTATION-SCRIPT.md)
- Technical demo (≤3 min): _link pending upload_ — script: [docs/TECH_DEMO_SCRIPT.md](TECH_DEMO_SCRIPT.md); final script: [docs/video/P0-3B-TECH-DEMO-SCRIPT.md](video/P0-3B-TECH-DEMO-SCRIPT.md)

## Demand validation & GTM

- Outreach to DePIN projects (NATIX, Hivemapper) has started. NATIX acknowledged our proposal and escalated it to their team for review. No project has committed to a pilot yet.
- NATIX support acknowledged the proposal and escalated it internally. PROJECT-TEAM REPLY = NOT YET / PILOT INTEREST = NOT YET / PILOT AGREED = NO / ADOPTION = NOT YET.
- Distribution plan: Early-Humans waitlist → invite to verified enrollment
  (wallet-challenge) → first pilot run allocations → feedback loop into
  evidence ledger. First gate: 10 real humans → 30 → 200.
- Live entry point: [https://odp.mealkey.cn](https://odp.mealkey.cn) — the canonical
  @odp/pilot backend (Early Humans enrollment · wallet challenge · claim · operator API).
  Demo videos recorded against the local/devnet deployment (see demo-runbook).

## What's next (post-hackathon)

More discovery sources (X/GitHub/on-chain crawlers behind the existing
interface), richer evidence collectors, real X OAuth identity, multi-project
radar, refund/expiry paths on-chain. Explicitly NOT in scope now: protocol
token, DAO, ads, pay-to-reach — see the whitepaper constitution
([docs/whitepaper-v0.1.md](whitepaper-v0.1.md)).
