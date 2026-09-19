# DEPLOY-1 — canonical Pilot backend on a single VPS

Deploys the **exact** PILOT-0-passing commit as a single-instance, persistent,
public HTTPS service. No Docker, no K8s, no Redis, no DB, no horizontal scale
(file-backed store ⇒ `INSTANCE COUNT = 1` until a DB migration exists).

## Topology

```text
odp.mealkey.cn        → Vercel Front Door (Learn — not this repo's concern)
enroll.odp.mealkey.cn → THIS: Caddy HTTPS → 127.0.0.1:3200 → @odp/pilot
                          data: /var/lib/odp-pilot   (private, persistent)
                          secrets: /etc/odp-pilot/   (env + project key)
```

## Layout (frozen)

| Path | Purpose |
| --- | --- |
| `/opt/odp/releases/<sha>` | immutable release (built) |
| `/opt/odp/current` | symlink → active release |
| `/var/lib/odp-pilot` | PRIVATE persistent store (humans, runs, challenges) |
| `/etc/odp-pilot/odp-pilot.env` | `ODP_PILOT_PORT` / `ODP_PILOT_DATA` / `ODP_OPERATOR_TOKEN` (chmod 640 root:odp-pilot) |
| `/etc/odp-pilot/project-key.json` | pilot project authority key (transferred by the project owner via scp — never chat) |
| logs | `journalctl -u odp-pilot` |

## Install (root on the VPS)

```bash
apt install -y git curl            # + Node.js >= 20 (nodesource recommended)
./deploy/install.sh 64942eab9d104cb994d314e0428aec5e17755a30
```

Then, out-of-band:

```bash
# from the project owner's machine (NEVER through chat):
scp .odp/pilot/project-key.json root@enroll-host:/etc/odp-pilot/project-key.json
# on the VPS:
chown root:odp-pilot /etc/odp-pilot/project-key.json && chmod 640 /etc/odp-pilot/project-key.json
systemctl restart odp-pilot
```

## Caddy

```bash
apt install -y caddy
# edit deploy/Caddyfile: replace the basic_auth hash with:
#   caddy hash-password --plaintext '<your operator UI password>'
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

DNS: `enroll.odp.mealkey.cn` A → VPS IPv4, **DNS only** (grey cloud) for first
bring-up so Caddy terminates TLS. Cloudflare proxy is a post-PASS decision —
never tune two TLS layers at once.

## Backups

```bash
cp deploy/backup.sh /usr/local/bin/odp-pilot-backup.sh
# timer daily 03:15, see deploy/odp-pilot-backup.timer (service+timer units)
```

## Smoke (D1–D6, D8) — D7 is the human

```bash
./deploy/smoke.sh https://enroll.odp.mealkey.cn [expected-eligible]
```

| Gate | Check |
| --- | --- |
| D1 | exact SHA release deployed, service PID live |
| D2 | `https://enroll.odp.mealkey.cn` = 200 |
| D3 | `systemctl restart odp-pilot` → real_humans preserved |
| D4 | aggregate state carries no handles (`@`) |
| D5 | operator endpoints: unauthorized blocked, authorized works |
| D6 | no human key material anywhere on the server |
| D7 | **MANUAL**: public Phantom → enroll → (operator plan+prepare) → self-custody claim → receipt |
| D8 | evidence export reproducible from the persistent store |

## Hard constraints

- `INSTANCE COUNT = 1` — one process, no PM2 cluster, no second writer.
- Data NEVER inside the repo tree (`ODP_PILOT_DATA=/var/lib/odp-pilot`, set in
  the env file — never cwd-derived).
- Secrets never in git, logs, pages, or chat.
- The server never holds a human private key (enrollment = signature
  verification; claim = the human's own wallet signs and submits).
