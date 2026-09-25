# Technical Demo Script — 2:30 (hard cap 3:00)

No vision talk. Show the "how": stack, on-chain logic, key design choices.
Every claim on screen is backed by a live artifact.

| Time | On screen | Say (beat) |
| --- | --- | --- |
| 0:00–0:15 | repo + `npm run build && npm test` output | "TypeScript monorepo, five frozen engines, full suite green in CI — and a Rust cross-check on the Merkle wire format." |
| 0:15–0:40 | `/radar` (frozen P0 evidence set → real protocol engine output) | "Discover: three projects on the radar. Verdicts are DERIVED from evidence — derivation-locked: a passport that disagrees with its evidence cannot even parse." |
| 0:40–1:05 | `/project/aurora` | "Trust: six evidence dimensions assemble the passport. The ruling ALLOW is computed, never declared — and the derivation lock proves it." |
| 1:05–1:35 | `/distribution/aurora` | "Match: only ALLOW projects enter. Interest fit 55%, human confidence 20%, reputation 15%, network 10%. Sib is BLOCKED — risk flags hard-block at zero. And watch: match score is NOT token entitlement — Maya scores 0.942 and Dan 0.491, but each receives 5,000. Matching decides eligibility; allocation follows protocol policy." |
| 1:35–2:00 | Anchor program + devnet evidence | "On-chain: Anchor distributor, PDA vault, one-shot immutable Merkle root, ClaimReceipt with double-claim rejection, no admin sweep. 15/15 attack matrix on devnet — wrong wallet, wrong amount, wrong proof, replay: all rejected." |
| 2:00–2:30 | PILOT-0 recording | "And this is not a fixture: a real human enrolled by signing a wallet-ownership challenge with their own Phantom — ODP never held a key — was matched, and claimed their allocation with their own signature. ClaimReceipt on-chain, machine-verified. Token finds the human." |

End card: `github.com/xqw1377-prog/ODP` · PILOT0_VERDICT · explorer links.

## Recording notes

- Local demo: `npm run demo:prepare` then `npm run dev` (see demo-runbook).
- PILOT-0 claim clip: screen-record the /claim flow (or reuse the PILOT-0
  session recording); explorer tabs pre-loaded.
- 2:30 target keeps a 30s buffer under the 3:00 cap.
