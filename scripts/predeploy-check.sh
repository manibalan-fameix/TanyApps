#!/usr/bin/env bash
# Run before every production deploy: bash scripts/predeploy-check.sh
# Fails on anything that must never reach production.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
bad() { echo "BLOCKED: $1" >&2; fail=1; }

for flag in RAZORPAY_ALLOW_DIRECT FIREBASE_TEST_PHONES LOCAL_ADMIN_PASSWORD; do
  grep -q "\"$flag\"" wrangler.jsonc && bad "$flag is set in wrangler.jsonc vars (dev-only)."
done
grep -q '"ROOT_DOMAIN": "tany.in"' wrangler.jsonc || bad 'ROOT_DOMAIN in wrangler.jsonc is not "tany.in".'
grep -q '"RC_PROVIDER": "mock"' wrangler.jsonc && echo "warning: RC_PROVIDER is mock, so RC data is fake and nothing is shown as Verified." >&2
# Secrets the app cannot work without. upload-secrets.sh sends them from .env.local, so an empty one here means an empty one live.
for key in ENCRYPTION_KEY BLIND_INDEX_KEY CRON_SECRET TRACKER_SECRET; do
  grep -q "^$key=.\+" .env.local 2>/dev/null || bad "$key is empty or missing in .env.local (scripts/upload-secrets.sh would not set it)."
done
if [ -n "$(git status --porcelain)" ]; then bad "working tree has uncommitted changes. Commit first so the deploy matches git."; fi
[ "$(git remote get-url origin)" = "https://github.com/manibalan-fameix/TanyApps.git" ] || bad "origin is not the TanyApps repo."

pnpm typecheck || bad "typecheck failed."
pnpm lint || bad "lint failed."
pnpm test || bad "tests failed."

[ "$fail" = 0 ] && echo "predeploy check passed." || { echo "predeploy check FAILED." >&2; exit 1; }
