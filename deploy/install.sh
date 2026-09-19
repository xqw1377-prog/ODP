#!/usr/bin/env bash
# DEPLOY-1 installer — run AS ROOT on the VPS.
# Deploys an EXACT ODP commit as a single-instance systemd service.
# Idempotent: re-running with the same SHA re-deploys that release.
#
# usage: ./install.sh 64942eab9d104cb994d314e0428aec5e17755a30
set -euo pipefail

SHA="${1:?usage: install.sh <full-or-40char commit sha>}"
SHA="${SHA:0:40}"
REPO="https://github.com/xqw1377-prog/ODP.git"
REL="/opt/odp/releases/${SHA}"
CURRENT="/opt/odp/current"
DATA="/var/lib/odp-pilot"
ETC="/etc/odp-pilot"

[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
command -v node >/dev/null || { echo "Node.js >= 20 required (apt install nodejs or nodesource)"; exit 1; }
echo "node: $(node --version)"

# ── 1. user + directories ────────────────────────────────────────────────
id -u odp-pilot >/dev/null 2>&1 || useradd --system --home /var/lib/odp-pilot --shell /usr/sbin/nologin odp-pilot
mkdir -p "$DATA" "$ETC" "$(dirname "$REL")"
chown -R odp-pilot:odp-pilot "$DATA"
chmod 700 "$DATA" "$ETC"

# ── 2. secrets (created once; NEVER committed, NEVER logged) ────────────
if [ ! -f "$ETC/odp-pilot.env" ]; then
  cat > "$ETC/odp-pilot.env" <<ENV
ODP_PILOT_PORT=3200
ODP_PILOT_DATA=$DATA
ODP_OPERATOR_TOKEN=$(openssl rand -hex 32)
NODE_ENV=production
ENV
  echo "created $ETC/odp-pilot.env (ODP_OPERATOR_TOKEN generated — store it now: grep OPERATOR $ETC/odp-pilot.env)"
fi
chown root:odp-pilot "$ETC/odp-pilot.env"
chmod 640 "$ETC/odp-pilot.env"
# project authority key is transferred out-of-band (scp by the project owner)
# into $ETC/project-key.json — chmod 640 root:odp-pilot. Never through chat.

# ── 3. release at the EXACT commit ───────────────────────────────────────
if [ ! -d "$REL" ]; then
  mkdir -p "$REL"
  cd "$REL"
  git init -q
  git remote add origin "$REPO"
  git fetch --depth 1 origin "$SHA"
  git checkout -q FETCH_HEAD
else
  echo "release $REL already present — keeping"
fi

echo "building (npm ci + workspaces build)…"
cd "$REL"
npm ci
npm run build
chown -R root:root "$REL"
chmod -R go-w "$REL"

# ── 4. flip the current symlink ──────────────────────────────────────────
ln -sfn "$REL" "$CURRENT"
echo "current -> $CURRENT ($(cat "$CURRENT/packages/pilot/dist/server.js" >/dev/null && echo build-ok))"

# ── 5. systemd ───────────────────────────────────────────────────────────
cp "$CURRENT/deploy/odp-pilot.service" /etc/systemd/system/odp-pilot.service
cp "$CURRENT/deploy/backup.sh" /usr/local/bin/odp-pilot-backup.sh
chmod 755 /usr/local/bin/odp-pilot-backup.sh
cp "$CURRENT/deploy/odp-pilot-backup.service" /etc/systemd/system/odp-pilot-backup.service
cp "$CURRENT/deploy/odp-pilot-backup.timer" /etc/systemd/system/odp-pilot-backup.timer
systemctl daemon-reload
systemctl enable --now odp-pilot-backup.timer
systemctl enable --now odp-pilot.service
sleep 2
systemctl --no-pager --lines 3 status odp-pilot.service || true

echo ""
echo "NEXT:"
echo "  1. scp the project authority key to $ETC/project-key.json (chown root:odp-pilot, chmod 640)"
echo "  2. install Caddy with deploy/Caddyfile (DNS: enroll.odp.mealkey.cn -> this host, DNS only)"
echo "  3. run deploy/smoke.sh https://enroll.odp.mealkey.cn"
