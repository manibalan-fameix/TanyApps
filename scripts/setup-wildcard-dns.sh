#!/usr/bin/env bash
# One-time: creates the proxied wildcard record (*.tany.in) so every dealer subdomain reaches the Worker.
# Needs CLOUDFLARE_API_TOKEN (Zone > DNS: Edit) and CLOUDFLARE_ZONE_ID in .env.local. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
# Read only the two keys we need. Sourcing the whole file breaks on any stray non-KEY=value line.
getenv() { grep -E "^$1=" .env.local | tail -1 | cut -d= -f2- | sed -E "s/^[\"']|[\"']$//g"; }
CLOUDFLARE_API_TOKEN="$(getenv CLOUDFLARE_API_TOKEN)"
CLOUDFLARE_ZONE_ID="$(getenv CLOUDFLARE_ZONE_ID)"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN in .env.local}"
: "${CLOUDFLARE_ZONE_ID:?set CLOUDFLARE_ZONE_ID in .env.local}"
api="https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records"
auth="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
existing=$(curl -s -H "$auth" "$api?type=AAAA&name=*.tany.in" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["result"]))')
if [ "$existing" != "0" ]; then echo "wildcard record already exists."; exit 0; fi
# 100:: is a placeholder origin: the proxied wildcard record only triggers the Worker route.
curl -s -X POST -H "$auth" -H "Content-Type: application/json" "$api" \
  --data '{"type":"AAAA","name":"*","content":"100::","proxied":true,"comment":"Tany dealer subdomains"}' \
  | python3 -c 'import json,sys; r=json.load(sys.stdin); print("created" if r["success"] else r["errors"])'
