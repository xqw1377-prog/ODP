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
| Domain contract | 7 frozen schemas; status derived from evidence (derivation lock); strict identity binding; u64-safe amounts | 163 tests, CI-enforced TS↔Rust merkle vector |
| Passport engine | Discovery → evidence assembly → six-dim passport → validated persistence (atomic writes, read-side tamper rejection) → radar/detail read models | `packages/passport-engine` |
| Matching engine | ALLOW hard gate; deterministic 4-factor score (interest fit 55 / human confidence 20 / reputation 15 / network 10); risk flags hard-block at 0; explainable reasons | `packages/matching-engine` |
| Solana distributor | Anchor program `GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW`: PDA vault, one-shot immutable root commit, on-chain merkle verify incl. base58 leaf recompute, ClaimReceipt PDA double-claim rejection, conservation, NO admin sweep | [devnet evidence](devnet-evidence-dst_aurora_devnet_003.md): 15/15 matrix incl. rejections |
| Demo layer | 4-scene web app over the real pipelines; demo-wallet claim signing server-side | [browser E2E evidence](browser-e2e-evidence-dst_aurora_demo_20260918150700.md): real Chrome click → fresh devnet tx `23Wh2oTs…` → Maya balance 5000 |

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

Off-chain: TypeScript (5 workspace packages, 163 tests, CI green incl.
cross-language merkle vector). On-chain: Anchor 1.2 / Agave 4.2.2 Devnet.
Full details: [docs/architecture.md](architecture.md),
[README](../README.md).

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
npm install && npm run build && npm test   # 163/163
cd packages/web
npm run demo:prepare    # fresh devnet distribution → READY TO CLAIM
npm run dev             # http://127.0.0.1:3000/radar
```

## What's next (post-hackathon)

More discovery sources (X/GitHub/on-chain crawlers behind the existing
interface), richer evidence collectors, real X OAuth identity, multi-project
radar, refund/expiry paths on-chain. Explicitly NOT in scope now: protocol
token, DAO, ads, pay-to-reach — see the whitepaper constitution
([docs/whitepaper-v0.1.md](whitepaper-v0.1.md)).
