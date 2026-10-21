#!/usr/bin/env bash
# One-time: creates the proxied wildcard record so every business subdomain reaches the Worker.
#   bash scripts/setup-wildcard-dns.sh            *.tany.in          (production)
#   bash scripts/setup-wildcard-dns.sh staging    *.tanystaging.in   (staging; reads .env.staging, falling back to .env.local for the token)
# Needs CLOUDFLARE_API_TOKEN (Zone > DNS: Edit) and CLOUDFLARE_ZONE_ID in .env.local. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-production}" in
  production) FULL="*.tany.in"; NAME="*"; ENVF=.env.local ;;
  staging) FULL="*.tanystaging.in"; NAME="*"; ENVF=.env.staging ;;
  *) echo "usage: bash scripts/setup-wildcard-dns.sh [production|staging]" >&2; exit 2 ;;
esac
# Read only the two keys we need. Sourcing the whole file breaks on any stray non-KEY=value line.
getenv() { grep -E "^$1=" "$ENVF" 2>/dev/null | tail -1 | cut -d= -f2- | sed -E "s/^[\"']|[\"']$//g"; }
CLOUDFLARE_API_TOKEN="$(getenv CLOUDFLARE_API_TOKEN)"
[ -z "$CLOUDFLARE_API_TOKEN" ] && [ "$ENVF" = .env.staging ] && CLOUDFLARE_API_TOKEN="$(grep -E "^CLOUDFLARE_API_TOKEN=" .env.local | tail -1 | cut -d= -f2- | sed -E "s/^[\"']|[\"']$//g")"
CLOUDFLARE_ZONE_ID="$(getenv CLOUDFLARE_ZONE_ID)"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN in $ENVF (or .env.local)}"
: "${CLOUDFLARE_ZONE_ID:?set CLOUDFLARE_ZONE_ID in $ENVF}"
api="https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records"
auth="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
existing=$(curl -s -H "$auth" "$api?type=AAAA&name=$FULL" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["result"]))')
if [ "$existing" != "0" ]; then echo "wildcard record already exists."; exit 0; fi
# 100:: is a placeholder origin: the proxied wildcard record only triggers the Worker route.
curl -s -X POST -H "$auth" -H "Content-Type: application/json" "$api" \
  --data "{\"type\":\"AAAA\",\"name\":\"$NAME\",\"content\":\"100::\",\"proxied\":true,\"comment\":\"Tany business subdomains ($FULL)\"}" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin); print("created" if r["success"] else r["errors"])'
