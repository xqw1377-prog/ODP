#!/usr/bin/env bash
# Daily backup of the ODP pilot private store (DEPLOY-1: retain >= 7).
# systemd timer: deploy/odp-pilot-backup.{service,timer}
set -euo pipefail
SRC="/var/lib/odp-pilot"
DST="/var/backups/odp-pilot"
mkdir -p "$DST"
STAMP="$(date +%Y%m%d)"
tar -czf "$DST/odp-pilot-$STAMP.tgz" -C "$(dirname "$SRC")" "$(basename "$SRC")"
chmod 600 "$DST/odp-pilot-$STAMP.tgz"
# retain the newest 7
ls -1t "$DST"/odp-pilot-*.tgz 2>/dev/null | tail -n +8 | xargs -r rm -f
echo "backup written: $DST/odp-pilot-$STAMP.tgz"
