#!/usr/bin/env bash
# Uploads the runtime secrets to the Cloudflare Workers in one call each.
# Usage: bash scripts/upload-secrets.sh            production, from .env.local
#        bash scripts/upload-secrets.sh staging    staging, from .env.staging, to the "staging" environment of each Worker
# (run `pnpm exec wrangler login` first, and deploy once so the Workers exist)
# Empty values are skipped. Nothing is printed except the key names.
# The file must hold values for the target: the script refuses a DATABASE_URL that points at this machine, and for staging it also
# refuses the production database and any live Razorpay key.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-production}"
case "$TARGET" in
  production) export ENV_FILE=".env.local"; WR_ENV=() ;;
  staging) export ENV_FILE=".env.staging"; WR_ENV=(--env staging) ;;
  *) echo "usage: bash scripts/upload-secrets.sh [production|staging]" >&2; exit 2 ;;
esac
export TARGET
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE not found." >&2; exit 1; }

python3 - <<'PY'
import os, re, sys
from urllib.parse import urlparse
env = {}
for line in open(os.environ["ENV_FILE"]):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
    if m:
        env[m[1]] = m[2].strip().strip('"').strip("'")
host = urlparse(env.get("DATABASE_URL", "")).hostname or ""
if not host or host in ("localhost", "127.0.0.1", "::1") or host.endswith(".local"):
    sys.exit(f"DATABASE_URL in {os.environ['ENV_FILE']} points at a local database. Put the {os.environ['TARGET']} URL there first.")
if os.environ["TARGET"] == "staging":
    if env.get("RAZORPAY_KEY_ID", "").startswith("rzp_live_"):
        sys.exit("RAZORPAY_KEY_ID in .env.staging is a LIVE key. Staging must use rzp_test_ keys.")
    # Staging must never share production's database: compare with the production file when it exists.
    try:
        prod = {}
        for line in open(".env.local"):
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
            if m:
                prod[m[1]] = m[2].strip().strip('"').strip("'")
        if prod.get("DATABASE_URL") and urlparse(prod["DATABASE_URL"]).path == urlparse(env["DATABASE_URL"]).path and urlparse(prod["DATABASE_URL"]).hostname == host:
            sys.exit("DATABASE_URL in .env.staging is the same database as .env.local (production). Use a separate Neon branch.")
        for k in ("AUTH_SECRET", "ENCRYPTION_KEY", "BLIND_INDEX_KEY"):
            if env.get(k) and env.get(k) == prod.get(k):
                sys.exit(f"{k} in .env.staging is the same as production's. Generate a new one for staging.")
    except FileNotFoundError:
        pass
if env.get("RAZORPAY_KEY_ID", "").startswith("rzp_test_"):
    print("note: RAZORPAY_KEY_ID is a TEST key (rzp_test_). Fine for staging, not for taking real money.", file=sys.stderr)
PY

python3 - <<'PY' | pnpm exec wrangler secret bulk "${WR_ENV[@]+"${WR_ENV[@]}"}"
import json, os, re, sys
keys = ["DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
        "RC_API_KEY", "VISION_API_KEY", "TRACKER_SECRET", "CRON_SECRET", "BLIND_INDEX_KEY",
        "GOOGLE_MAPS_SERVER_KEY", "GOOGLE_ROUTES_TOLLS", "GOOGLE_ROUTE_CACHE_DAYS", "CABS_ALLOWED_EMAILS", "R2_PRIVATE_BUCKET", "PILOT_DEALERS", "PHONE_OTP_PROVIDER", "FIREBASE_APPCHECK_SITE_KEY",
        "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
        "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ANALYTICS_TOKEN"]
env = {}
for line in open(os.environ["ENV_FILE"]):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
    if m:
        env[m[1]] = m[2].strip().strip('"').strip("'")
out = {k: env[k] for k in keys if env.get(k)}
print("app: uploading:", sorted(out), file=sys.stderr)
print("app: skipped (empty):", [k for k in keys if not env.get(k)], file=sys.stderr)
print(json.dumps(out))
PY

# The tracker verifies rider tickets with the very same TRACKER_SECRET.
python3 - <<'PY' | pnpm exec wrangler secret bulk -c workers/tracker/wrangler.jsonc "${WR_ENV[@]+"${WR_ENV[@]}"}"
import json, os, re, sys
env = {}
for line in open(os.environ["ENV_FILE"]):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
    if m:
        env[m[1]] = m[2].strip().strip('"').strip("'")
out = {k: env[k] for k in ["TRACKER_SECRET"] if env.get(k)}
print("tracker: uploading:", sorted(out), file=sys.stderr)
print(json.dumps(out))
PY

# The cron worker sends the very same CRON_SECRET to the app's internal cron route.
python3 - <<'PY' | pnpm exec wrangler secret bulk -c workers/cron/wrangler.jsonc "${WR_ENV[@]+"${WR_ENV[@]}"}"
import json, os, re, sys
env = {}
for line in open(os.environ["ENV_FILE"]):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
    if m:
        env[m[1]] = m[2].strip().strip('"').strip("'")
out = {k: env[k] for k in ["CRON_SECRET"] if env.get(k)}
print("cron: uploading:", sorted(out), file=sys.stderr)
print(json.dumps(out))
PY
