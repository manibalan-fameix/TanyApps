#!/usr/bin/env bash
# Uploads the runtime secrets from .env.local to the Cloudflare Workers in one call each.
# Usage: bash scripts/upload-secrets.sh   (run `pnpm exec wrangler login` first, and deploy once so the Workers exist)
# Empty values are skipped. Nothing is printed except the key names.
# .env.local must hold PRODUCTION values: the script refuses a DATABASE_URL that points at this machine.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import re, sys
from urllib.parse import urlparse
env = {}
for line in open(".env.local"):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
    if m:
        env[m[1]] = m[2].strip().strip('"').strip("'")
host = urlparse(env.get("DATABASE_URL", "")).hostname or ""
if not host or host in ("localhost", "127.0.0.1", "::1") or host.endswith(".local"):
    sys.exit("DATABASE_URL in .env.local points at a local database. Put the production URL there first.")
if env.get("RAZORPAY_KEY_ID", "").startswith("rzp_test_"):
    print("note: RAZORPAY_KEY_ID is a TEST key (rzp_test_). Fine for staging, not for taking real money.", file=sys.stderr)
PY

python3 - <<'PY' | pnpm exec wrangler secret bulk
import json, re, sys
keys = ["DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
        "RC_API_KEY", "VISION_API_KEY", "TRACKER_SECRET", "CRON_SECRET", "BLIND_INDEX_KEY",
        "GOOGLE_MAPS_SERVER_KEY", "GOOGLE_ROUTES_TOLLS", "GOOGLE_ROUTE_CACHE_DAYS", "CABS_ALLOWED_EMAILS", "R2_PRIVATE_BUCKET", "PILOT_DEALERS",
        "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
        "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ANALYTICS_TOKEN"]
env = {}
for line in open(".env.local"):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
    if m:
        env[m[1]] = m[2].strip().strip('"').strip("'")
out = {k: env[k] for k in keys if env.get(k)}
print("app: uploading:", sorted(out), file=sys.stderr)
print("app: skipped (empty):", [k for k in keys if not env.get(k)], file=sys.stderr)
print(json.dumps(out))
PY

# The tracker verifies rider tickets with the very same TRACKER_SECRET.
python3 - <<'PY' | pnpm exec wrangler secret bulk -c workers/tracker/wrangler.jsonc
import json, re, sys
env = {}
for line in open(".env.local"):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
    if m:
        env[m[1]] = m[2].strip().strip('"').strip("'")
out = {k: env[k] for k in ["TRACKER_SECRET"] if env.get(k)}
print("tracker: uploading:", sorted(out), file=sys.stderr)
print(json.dumps(out))
PY

# The cron worker sends the very same CRON_SECRET to the app's internal cron route.
python3 - <<'PY' | pnpm exec wrangler secret bulk -c workers/cron/wrangler.jsonc
import json, re, sys
env = {}
for line in open(".env.local"):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
    if m:
        env[m[1]] = m[2].strip().strip('"').strip("'")
out = {k: env[k] for k in ["CRON_SECRET"] if env.get(k)}
print("cron: uploading:", sorted(out), file=sys.stderr)
print(json.dumps(out))
PY
