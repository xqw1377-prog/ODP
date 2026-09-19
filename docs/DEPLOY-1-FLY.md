# DEPLOY-1 / Fly.io — ODP pilot (`@odp/pilot`)

Ops-only runbook. **PILOT SEMANTICS = FROZEN.** Do not change Passport / Matching / Distribution / Merkle / Claim / eligibility / evidence rules. Do not open Early Humans recruitment CTA / Connect Wallet as a product change.

Commander lock 2026-09-20: **1 Machine**, `shared-cpu-1x` / **1GB RAM**, `auto_stop_machines = false`, `min_machines_running = 1`, listen **0.0.0.0:3200**, volume **`/data`**.

## Why the app root is the repo root

`@odp/pilot` is an npm workspace package. It imports frozen engines (`@odp/domain`, `@odp/passport-engine`, `@odp/matching-engine`, `@odp/distribution-engine`). `fly.toml` + `Dockerfile` live at the **repository root** so `npm ci` can resolve workspaces and the image can compile those packages, then start:

```text
node packages/pilot/dist/server.js
```

Static files are served from `packages/pilot/public` (resolved from `import.meta.url`, not cwd).

## Local listen vs Fly listen

| Env | Local default | Fly (`fly.toml` `[env]`) |
|---|---|---|
| `ODP_PILOT_HOST` | `127.0.0.1` | `0.0.0.0` |
| `ODP_PILOT_PORT` | `3200` | `3200` |
| `ODP_PILOT_DATA` | `$PWD/.odp/pilot` | `/data` |

`PilotStore` creates `humans/`, `projects/`, `runs/`, `challenges/`, `claims/`, `engine/` under `ODP_PILOT_DATA`. **Mount `/data` and set `ODP_PILOT_DATA=/data`.** Do not use `/data/pilot` — no extra mkdir.

## First deploy (operator)

Requires `flyctl` authenticated to the org that will own `odp-pilot`.

```bash
# 1. Create the app once (name must match fly.toml `app`)
fly apps create odp-pilot --org <your-org>

# 2. Secret only — never commit, never bake into the image
fly secrets set ODP_OPERATOR_TOKEN='<operator-token-min-8-chars>' -a odp-pilot

# 3. Deploy from repo root (creates volume odp_pilot_data on first deploy)
fly deploy -a odp-pilot
```

Do **not** run `fly scale count 2` (or higher). Volumes are not replicated; 2+ Machines is denied.

Dedicated **DEVNET** pilot authority keypair is operator-held (used by `packages/pilot/scripts/pilot-prepare.ts`). It is not an image env and must never be committed.

## Public hostname (later)

Intended public host: **`enroll.odp.mealkey.cn`**

1. DNS: `CNAME enroll.odp.mealkey.cn` → `odp-pilot.fly.dev`
2. Certs: `fly certs add enroll.odp.mealkey.cn -a odp-pilot` (Fly-managed)

Until DNS + certs exist, use the Fly hostname only.

## Volume snapshots

`fly.toml` sets `scheduled_snapshots = true` (Fly daily snapshots, default retention 5 days). **Enable/confirm daily snapshots** after first volume exists:

```bash
fly volumes list -a odp-pilot
fly volumes snapshots list <vol_id> -a odp-pilot
```

Recommend an **additional daily backup later** (operator copy of `/data` off-Fly). Snapshots are not a substitute for that copy.

## Smoke gates D1–D7

List only. **Do not mark PASS here** — run after a live Machine exists.

| Gate | Check |
|---|---|
| **D1** | Process bind: Machine listens `0.0.0.0:3200`; `GET /` returns the pilot page (200) |
| **D2** | Public API: `GET /api/pilot/meta` and `GET /api/pilot/state` return 200 (aggregates only) |
| **D3** | Persistence: `ODP_PILOT_DATA=/data` on volume `odp_pilot_data`; a write survives `fly machine restart` |
| **D4** | Secrets: `ODP_OPERATOR_TOKEN` is a Fly secret only; `GET /api/operator/claims` without `x-operator-token` is 403 (fail-closed). No secrets/keys in git or image |
| **D5** | Topology: exactly **1** Machine; `shared-cpu-1x` / **1GB**; `auto_stop_machines = false`; `min_machines_running = 1` |
| **D6** | Public host: `enroll.odp.mealkey.cn` CNAME → Fly; certificate Fly-managed |
| **D7** | Authority + snapshots: dedicated DEVNET pilot authority only; daily volume snapshot enabled (plus additional daily backup later) |

`DEPLOY-1 = PASS` only after D1–D7. Early Humans recruitment CTA stays intro-only until then.
