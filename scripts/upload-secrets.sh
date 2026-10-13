#!/usr/bin/env bash
# Uploads the runtime secrets from .env.local to the Cloudflare Worker in one call.
# Usage: bash scripts/upload-secrets.sh   (run `pnpm exec wrangler login` first if needed)
# Empty values are skipped. Nothing is printed except the key names.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY' | pnpm exec wrangler secret bulk
import json, re, sys
keys = ["DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
        "RC_API_KEY", "VISION_API_KEY", "TRACKER_SECRET"]
env = {}
for line in open(".env.local"):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
    if m:
        env[m[1]] = m[2].strip().strip('"').strip("'")
out = {k: env[k] for k in keys if env.get(k)}
print("uploading:", sorted(out), file=sys.stderr)
print("skipped (empty):", [k for k in keys if not env.get(k)], file=sys.stderr)
print(json.dumps(out))
PY
