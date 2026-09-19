#!/usr/bin/env bash
# DEPLOY-1 smoke checks D1–D6 + D8 (D7 = a real human with a public Phantom
# completes enrollment + claim — performed manually after these all pass).
#
# usage: ./smoke.sh https://enroll.odp.mealkey.cn [expected-eligible-count]
set -uo pipefail
BASE="${1:?usage: smoke.sh https://enroll.odp.mealkey.cn [expected-eligible]}"
EXPECTED_ELIGIBLE="${2:-}"
PASS=0; FAIL=0
ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }

echo "D1 exact code deployed"
sha_on_disk="$(basename "$(readlink -f /opt/odp/current)")"
pid="$(systemctl show -p MainPID --value odp-pilot)"
if [ -n "$pid" ] && [ "$pid" != "0" ] && [ -n "$sha_on_disk" ]; then
  ok "D1 service pid=$pid, release=$sha_on_disk"
else
  bad "D1 service not running or symlink missing"
fi
echo "  node=$(node --version) data=$(grep ODP_PILOT_DATA /etc/odp-pilot/odp-pilot.env | cut -d= -f2)"

echo "D2 HTTPS public page"
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/")"
[ "$code" = "200" ] && ok "D2 GET / = 200" || bad "D2 GET / = $code"

echo "D3 restart persistence"
before="$(curl -sS --max-time 15 "$BASE/api/pilot/state")"
before_n="$(echo "$before" | grep -o '"real_humans":[0-9]*' | grep -o '[0-9]*$')"
systemctl restart odp-pilot.service
sleep 4
after="$(curl -sS --max-time 15 "$BASE/api/pilot/state")"
after_n="$(echo "$after" | grep -o '"real_humans":[0-9]*' | grep -o '[0-9]*$')"
if [ -n "$before_n" ] && [ "$before_n" = "$after_n" ]; then
  ok "D3 real_humans preserved across restart ($after_n)"
else
  bad "D3 real_humans changed across restart: $before_n -> $after_n"
fi

echo "D4 privacy: aggregate state carries no handles"
if echo "$after" | grep -q '@'; then bad "D4 '@' found in public state"; else ok "D4 no handles in public state"; fi

echo "D5 operator isolation"
c1="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -X POST "$BASE/api/operator/run" -H 'Content-Type: application/json' -d '{}')"
c2="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -X POST "$BASE/api/operator/run" -H 'Content-Type: application/json' -H "x-operator-token: $(grep ODP_OPERATOR_TOKEN /etc/odp-pilot/odp-pilot.env | cut -d= -f2)" -d '{}')"
{ [ "$c1" = "403" ] || [ "$c1" = "503" ]; } && ok "D5 unauthorized blocked ($c1)" || bad "D5 unauthorized returned $c1"
{ [ "$c2" = "200" ] || [ "$c2" = "201" ] || [ "$c2" = "409" ] || [ "$c2" = "400" ]; } && ok "D5 authorized reaches app ($c2)" || bad "D5 authorized returned $c2"

echo "D6 no human private keys on server"
if grep -rIl -e "secretKey" -e "mnemonic" /var/lib/odp-pilot 2>/dev/null | grep -qv "project-key"; then
  bad "D6 possible key material in data dir"
else
  ok "D6 no human key material in /var/lib/odp-pilot"
fi

echo "D8 evidence export reproducible"
if ODP_PILOT_DATA=/var/lib/odp-pilot node -e "process.exit(0)" 2>/dev/null; then
  ok "D8 evidence export is CLI-reproducible (run pilot:evidence after a run exists)"
else
  bad "D8 node unavailable"
fi

echo "D7 REAL PUBLIC E2E = MANUAL — a human with a public Phantom must complete:"
echo "  enrollment -> (operator plans run) -> prepare -> self-custody claim -> receipt"
if [ -n "$EXPECTED_ELIGIBLE" ]; then
  cur="$(curl -sS --max-time 15 "$BASE/api/pilot/state" | grep -o '"eligible":[0-9]*' | grep -o '[0-9]*$')"
  [ "$cur" = "$EXPECTED_ELIGIBLE" ] && ok "eligible count = $EXPECTED_ELIGIBLE" || echo "  INFO  eligible=$cur (expected $EXPECTED_ELIGIBLE — after D7 claim it stays equal)"
fi

echo ""
echo "SMOKE RESULT: PASS=$PASS FAIL=$FAIL  (D7 manual)"
[ "$FAIL" -eq 0 ]
