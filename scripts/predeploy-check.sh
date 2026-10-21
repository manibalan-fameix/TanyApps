#!/usr/bin/env bash
# Run before every deploy:
#   bash scripts/predeploy-check.sh            production (reads .env.local)
#   bash scripts/predeploy-check.sh staging    staging (reads .env.staging)
# Fails on anything that must never reach the target.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
bad() { echo "BLOCKED: $1" >&2; fail=1; }

MODE="${1:-production}"
case "$MODE" in
  production) FILE=.env.local; ROOT="tany.in" ;;
  staging) FILE=.env.staging; ROOT="tanystaging.in" ;;
  *) echo "usage: bash scripts/predeploy-check.sh [production|staging]" >&2; exit 2 ;;
esac

# Value of KEY in a given env file (last assignment, quotes stripped), or empty.
val() { grep -E "^$1=" "$2" 2>/dev/null | tail -1 | cut -d= -f2- | sed -E "s/^[\"']|[\"']$//g" || true; }

for flag in RAZORPAY_ALLOW_DIRECT FIREBASE_TEST_PHONES LOCAL_ADMIN_PASSWORD FIREBASE_AUTH_EMULATOR_HOST GEO_FIXTURE E2E; do
  grep -q "\"$flag\"" wrangler.jsonc && bad "$flag is set in wrangler.jsonc vars (dev-only)."
  [ -n "$(val "$flag" "$FILE")" ] && bad "$flag is set in $FILE (dev and test only; the app ignores some of these in production, but they must not be uploaded)."
done

if [ "$MODE" = production ]; then
  grep -q '"ROOT_DOMAIN": "tany.in"' wrangler.jsonc || bad 'ROOT_DOMAIN in wrangler.jsonc is not "tany.in".'
else
  grep -q '"ROOT_DOMAIN": "tanystaging.in"' wrangler.jsonc || bad 'env.staging ROOT_DOMAIN in wrangler.jsonc is not "tanystaging.in".'
fi
grep -q '"RC_PROVIDER": "mock"' wrangler.jsonc && echo "warning: RC_PROVIDER is mock, so RC data is fake and nothing is shown as Verified." >&2

[ -f "$FILE" ] || bad "$FILE not found."
# Secrets the app cannot work without. upload-secrets.sh sends them from the file, so an empty one here means an empty one live.
core="ENCRYPTION_KEY BLIND_INDEX_KEY CRON_SECRET TRACKER_SECRET"
[ "$MODE" = staging ] && core="DATABASE_URL AUTH_SECRET $core R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_PRIVATE_BUCKET RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET CLOUDFLARE_ZONE_ID"
for key in $core; do
  [ -n "$(val "$key" "$FILE")" ] || bad "$key is empty or missing in $FILE (scripts/upload-secrets.sh would not set it)."
done

if [ "$MODE" = staging ]; then
  db="$(val DATABASE_URL "$FILE")"
  case "$db" in *localhost*|*127.0.0.1*|*"@::1"*) bad "DATABASE_URL in $FILE points at this machine." ;; esac
  prod_db="$(val DATABASE_URL .env.local)"
  [ -n "$db" ] && [ "$db" = "$prod_db" ] && bad "DATABASE_URL in $FILE is the production database. Use a separate Neon branch."
  [ -n "$db" ] && [ -n "$prod_db" ] && [ "${db%%\?*}" = "${prod_db%%\?*}" ] && bad "DATABASE_URL in $FILE is the same database as production (only the options differ)."
  case "$(val RAZORPAY_KEY_ID "$FILE")" in rzp_test_*) ;; "") ;; *) bad "RAZORPAY_KEY_ID in $FILE is not a test key (rzp_test_...). Staging must never take real money." ;; esac
  for key in AUTH_SECRET ENCRYPTION_KEY BLIND_INDEX_KEY CRON_SECRET TRACKER_SECRET; do
    [ -n "$(val "$key" "$FILE")" ] && [ "$(val "$key" "$FILE")" = "$(val "$key" .env.local)" ] && bad "$key in $FILE is the same as production's. Generate a new one."
  done
  [ "$(val R2_PRIVATE_BUCKET "$FILE")" = "$(val R2_PRIVATE_BUCKET .env.local)" ] && [ -n "$(val R2_PRIVATE_BUCKET "$FILE")" ] && bad "R2_PRIVATE_BUCKET is production's bucket. Use the staging bucket."
fi

if [ -n "$(git status --porcelain)" ]; then bad "working tree has uncommitted changes. Commit first so the deploy matches git."; fi
[ "$(git remote get-url origin)" = "https://github.com/manibalan-fameix/TanyApps.git" ] || bad "origin is not the TanyApps repo."

pnpm typecheck || bad "typecheck failed."
pnpm lint || bad "lint failed."
pnpm test || bad "tests failed."

[ "$fail" = 0 ] && echo "predeploy check ($MODE) passed." || { echo "predeploy check ($MODE) FAILED." >&2; exit 1; }
