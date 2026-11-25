#!/usr/bin/env bash
# Uploads the runtime secrets to the Cloudflare Workers in one call each.
# Usage: bash scripts/upload-secrets.sh            production, from .env.local
#        bash scripts/upload-secrets.sh staging    staging, from .env.staging, to the "staging" environment of each Worker
# (run `pnpm exec wrangler login` first. A Worker that does not exist yet is created as an empty stub holding just the secrets; the
# next deploy fills it in and keeps the secrets, so this can run BEFORE the first deploy.)
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
    # Staging has its own Firebase project. The web config is read from .env.staging; it must be complete and not production's.
    missing = [k for k in ("FIREBASE_API_KEY", "FIREBASE_PROJECT_ID", "FIREBASE_APP_ID") if not env.get(k)]
    if missing:
        sys.exit(f".env.staging is missing {', '.join(missing)} (the tany-staging Firebase web config).")
    m = re.search(r'"FIREBASE_PROJECT_ID":\s*"([^"]+)"', open("wrangler.jsonc").read())
    if m and env["FIREBASE_PROJECT_ID"] == m.group(1):
        sys.exit(f"FIREBASE_PROJECT_ID in .env.staging is production's project ({m.group(1)}). Staging needs its own Firebase project.")
    if env.get("RAZORPAY_KEY_ID", "").startswith("rzp_live_"):
        sys.exit("RAZORPAY_KEY_ID in .env.staging is a LIVE key. Staging must use rzp_test_ keys.")
    # Staging must never share production's database: compare with the production file when it exists.
    try:
        prod = {}
        for line in open(".env.local"):
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
            if m.  