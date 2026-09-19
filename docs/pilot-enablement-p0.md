# ODP Pilot Enablement P0

boarding doors only. The Passport / Matching / Solana engines stay the source of truth.

Protocol baseline: `90d7ef0`. This document does **not** change derivation rules, match weights, Merkle wire format, the Anchor program, claim rules, or the economic model.

## What this is

The hackathon demo is fixture-backed and hard-binds Aurora / Maya / Dan. That golden path stays. These adapters let a **real** pilot project and **real** opt-in humans enter the same engines without rewriting them.

```text
Project brief  ──▶  ProjectCandidate + EvidenceBundle + ProjectMatchIntent
                         │
                         ▼
                   passport-engine.generatePassport
                   matching-engine.matchProject
                   distribution-engine.buildAllocations
                         │
                         ▼
                   off-chain merkle / manifest inputs
                   (same FROZEN-V1 helpers demo:prepare uses)

Early Human    ──▶  HumanProfile + consent sidecar
                         │
                         ▼
                   matching-engine loadHumanProfiles shape
```

Aurora demo: `packages/web` `demo:prepare` + `/radar` → `/project/aurora` → `/claim/maya`.
Pilot path: `packages/pilot` + `/early-humans`. Parallel, not a replacement.

## 1. Real project intake

A brief is **not** a Passport. The adapter only maps fields and then **calls** `generatePassport`.

Required:

| Field | Maps to |
|---|---|
| `name` | `ProjectCandidate.name` (and `project_id` / `symbol` if omitted) |
| `x` | `ProjectCandidate.x_account` |
| `website` | `ProjectCandidate.website` |
| `humans_needed` | free text → `ProjectMatchIntent.target_tags` via the Early Humans V0 catalog |
| evidence | `EvidenceBundle` (inline, path, or pointers **with findings**) |

Optional: `wallet`, `github`, `symbol`, `project_id`, `token_address`, `target_tags`.

Evidence rules (fail closed):

- The adapter **will not invent findings** or a ruling.
- Supply `evidence_bundle`, `evidence_bundle_path`, or `evidence_pointers[]` where each pointer has `dimension + findings[]`.
- `bundle.project_id` must equal the candidate id.
- Matching still requires `passport.status === ALLOW`. If evidence is thin, the existing collectors + `derivePassportRuling` will emit WATCH/REJECT and `matchProject` will MATCH DENIED. That is correct.

```bash
npm run pilot:intake-project -- --brief packages/pilot/fixtures/briefs/helios.brief.json
# or: POST /api/pilot/projects  (inline evidence_bundle / pointers)
```

Writes under the pilot data dir: `candidates/`, `passports/` (via `PassportEngine`), `intents/<id>.intent.json`.

## 2. Early Humans V0

Landing (locked copy):

- Headline: **Stop hunting. Get discovered.**
- Sub: *Connect your X and Solana wallet. Tell ODP what you care about. Qualified crypto projects can find you when there’s a real match.*
- Do not use “Join our beta”.

Collects:

1. **Connect X** — V0 is a **stub**: explicit placeholder handle + `x_stub_acknowledged`. Repo reserved `ODP_HUMAN_SOURCE=x_oauth` but has no OAuth implementation; setting it errors instead of faking OAuth.
2. **Connect Solana wallet** — 32-byte base58 pubkey.
3. **3–5 interest tags** from: Solana, DePIN, AI, Developer, Node Operator, Consumer Crypto, DeFi, Gaming, Infrastructure, Early Adopter.
4. **Explicit opt-in** checkbox (`consent: true`).

Funnel (sidecar, not HumanProfile):  
`DISCOVERED → INVITED → LANDING → X CONNECTED → WALLET BOUND → CONSENTED → INTERESTS COMPLETED → ELIGIBLE HUMAN → MATCHED → CLAIMED`  

**Only `ELIGIBLE_HUMAN` with no review flags counts as the pool.** Multi-wallet / multi-X collisions are stored as REVIEW (`WALLET_BOUND`) and are not matchable. Interest tags are user-selected. V0 does not compute reputation (`reputation=0`, `network_score=0`).

Near-term ops target: **30 ELIGIBLE** seed (10 builders / 8 DePIN-node / 5 infra / 4 early adopters / 3 founders). 1000 is stretch HOLD.

UI: `http://127.0.0.1:3000/early-humans`. Pool dump: `/pool`, `/api/pilot/pool`, `/api/pilot/pool.txt`, or `npm run pilot:pool`. CLI:

```bash
npm run pilot:intake-human -- --file packages/pilot/fixtures/humans/hum_pilot_ada.intake.json
```

Persists the frozen `HumanProfile` (strict G1 — no extra fields) plus a **consent sidecar**. Humans without a sidecar are refused at match load.

V0 does **not** fabricate reputation: `human_confidence=0`, `reputation=0`, `network_score=0`, `risk_flags=[]` (unscored stub; match is interest-fit). No scraped X users are imported into the pool.

## 3. Generic pilot runner

Not bound to `AURORA_PROJECT_ID` / Maya / Dan.

```text
pilot project intake → load opt-in humans → matchProject → buildAllocations
                    → FROZEN-V1 merkle root/proofs → canonical manifest
```

```bash
npm run pilot:run -- --brief packages/pilot/fixtures/briefs/helios.brief.json
# later, against an already-ingested project:
npm run pilot:run -- --project prj_helios_mesh
```

Writes `.odp/pilot/runs/<distribution_id>.json` (or `$ODP_PILOT_DIR/runs/…`) with allocations, merkle root/proofs, and `manifest_hash` — the same off-chain objects `demo:prepare` builds before the Solana ix sequence.

On-chain `demo:prepare` stays the Aurora golden-path script (needs the demo project key + Maya/Dan ATAs). A generic chain prepare is the same ix order (`initialize` → `fund` → `commit_root` → `open_claims`) fed by the run file; P0 does not add a second funded-key ceremony.

## Data dir

`ODP_PILOT_DIR` → else `${ODP_DATA_DIR}/pilot` → else `<repo>/.odp/pilot` (gitignored).

## Prove it

```bash
npm run build
npm test                 # includes @odp/pilot + existing Aurora demo-data tests
npm run pilot:smoke      # (a) Helios × synthetic opt-in humans  (b) Aurora Maya>Dan>Sib
npm run pilot:pool       # ELIGIBLE count for ops
```

(a) `prj_helios_mesh` is not Aurora; humans are `hum_pilot_*` with consent.
(b) Existing fixtures still produce ALLOW + Maya > Dan > Sib(0). `packages/web` demo snapshot tests still pin the golden path.

## ALLOWED / FORBIDDEN (this slice)

**Shipped:** project intake adapter, Early Humans V0, generic `pilot:*` runner, docs + smoke.

**Not touched:** `derivePassportRuling` / collectors, `MATCH_WEIGHTS`, Merkle FROZEN-V1, Anchor distributor, claim server, equal-split policy, Aurora `demo:prepare` binding, main 4-scene visual journey (only a footer link + `/early-humans`).
