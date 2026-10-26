#!/usr/bin/env bash
# Black-box smoke checks for a deployed environment. Needs no credentials and changes nothing: every request is a GET/PUT/POST that
# the app must refuse, or a page that must render. It proves routing, tenant resolution, headers and that private endpoints are closed.
#
#   scripts/staging-smoke.sh tanystaging.in [tenant-slug]
#
# Local use against `next dev` (hosts are sent in the Host header, traffic goes to ORIGIN):
#   ORIGIN=http://127.0.0.1:3105 scripts/staging-smoke.sh localhost:3105
#
# Exit code 0 only if every check passes. Prints PASS/FAIL per check, never a secret.
set -u

ROOT="${1:?usage: staging-smoke.sh <root-domain> [tenant-slug]}"
SLUG="${2:-}"
ORIGIN="${ORIGIN:-}"
fail=0

req() { # method host path [extra curl args...] -> prints "status|location|headers-file"
  local method="$1" host="$2" path="$3"; shift 3
  local url hdr; hdr="$(mktemp)"
  if [ -n "$ORIGIN" ]; then url="$ORIGIN$path"; set -- -H "Host: $host" "$@"; else url="https://$host$path"; fi
  local code; code="$(curl -s -o /dev/null -D "$hdr" -w '%{http_code}' --max-time 20 -X "$method" "$@" "$url")"
  echo "$code|$hdr"
}
check() { # name expected-regex method host path [curl args...]
  local name="$1" want="$2" method="$3" host="$4" path="$5"; shift 5
  local out code hdr; out="$(req "$method" "$host" "$path" "$@")"; code="${out%%|*}"; hdr="${out#*|}"
  if [[ "$code" =~ ^($want)$ ]]; then echo "PASS  $name  ($code)"; else echo "FAIL  $name  expected $want, got $code"; fail=1; fi
  rm -f "$hdr"
}
check_header() { # name host path header-regex
  local name="$1" host="$2" path="$3" re="$4" out hdr
  out="$(req GET "$host" "$path")"; hdr="${out#*|}"
  if grep -qiE "$re" "$hdr"; then echo "PASS  $name"; else echo "FAIL  $name  header not found: $re"; fail=1; fi
  rm -f "$hdr"
}
check_location() { # name expected-location-regex method host path
  local name="$1" re="$2" method="$3" host="$4" path="$5" out code hdr
  out="$(req "$method" "$host" "$path")"; code="${out%%|*}"; hdr="${out#*|}"
  if [[ "$code" =~ ^30[1278]$ ]] && grep -iE '^location:' "$hdr" | grep -qE "$re"; then echo "PASS  $name  ($code)"; else echo "FAIL  $name  got $code without a redirect to $re"; fail=1; fi
  rm -f "$hdr"
}

APP="app.$ROOT"
echo "== $ROOT (app host $APP) =="

echo "-- security headers on the app host"
check_header "X-Content-Type-Options: nosniff" "$APP" /login '^x-content-type-options: *nosniff'
check_header "X-Frame-Options" "$APP" /login '^x-frame-options: *SAMEORIGIN'
check_header "Referrer-Policy" "$APP" /login '^referrer-policy: *strict-origin-when-cross-origin'
check_header "Permissions-Policy" "$APP" /login '^permissions-policy:'
check_header "Strict-Transport-Security" "$APP" /login '^strict-transport-security: *max-age='
check_header "CSP is report-only (never enforced yet)" "$APP" /login '^content-security-policy-report-only: .*report-uri /api/t/csp-report'
check_header "/login is never cached" "$APP" /login '^cache-control: *.*no-store'

check "CSP report endpoint accepts a report and answers 204" "204" POST "$APP" /api/t/csp-report -H 'content-type: application/csp-report' --data '{"csp-report":{"effective-directive":"img-src","blocked-uri":"https://example.com/x"}}'

echo "-- the Tany team area is closed to anonymous visitors"
check "/super/login renders" "200" GET "$APP" /super/login
check_location "/super redirects to the team sign-in" '/super/login' GET "$APP" /super
check_location "/super/export/businesses redirects (no data without a session)" '/super/login' GET "$APP" /super/export/businesses
check_location "/super/payments redirects" '/super/login' GET "$APP" /super/payments

echo "-- private endpoints refuse anonymous callers"
check "upload needs a session" "401" PUT "$APP" /api/upload/dealers/00000000-0000-4000-8000-000000000000/cars/x/front-a.jpg -H 'content-type: image/jpeg' --data-binary 'x'
check "own-media read needs a session" "401" GET "$APP" /api/media/dealers/00000000-0000-4000-8000-000000000000/x.jpg
check "private cab files need a session" "401" GET "$APP" /api/cabs/files/dealers/00000000-0000-4000-8000-000000000000/private/vehicle-doc/x.pdf
check "cron refuses a missing secret" "401" POST "$APP" /api/internal/cron/retry-order-refunds
check "cron refuses a wrong secret" "401" POST "$APP" /api/internal/cron/retry-order-refunds -H 'x-cron-secret: wrong'
check "payment webhook refuses an unsigned body" "400" POST "$APP" /api/webhooks/razorpay -H 'content-type: application/json' --data '{}'
check "payment webhook refuses a bad signature" "400" POST "$APP" /api/webhooks/razorpay -H 'x-razorpay-signature: deadbeef' --data '{}'

echo "-- routing and tenant resolution"
check "/sites/* is never reachable directly (app host)" "404" GET "$APP" /sites/anything
check "unknown business subdomain" "404" GET "nosuch-$RANDOM.$ROOT" /
check "/sites/* is never reachable directly (tenant host)" "404" GET "nosuch-$RANDOM.$ROOT" /sites/anything
check "internal cron is not served on a tenant host" "404" POST "nosuch-$RANDOM.$ROOT" /api/internal/cron/retry-order-refunds
# `next dev` deliberately serves admin routes on the bare root (see proxy.ts); a deployed environment must 404 them.
if [ -z "$ORIGIN" ]; then check "marketing host serves no API" "404" GET "$ROOT" /api/internal/cron/x; else echo "SKIP  marketing host serves no API (local dev serves admin on the bare root)"; fi
if [ -n "$SLUG" ]; then
  T="$SLUG.$ROOT"
  echo "-- tenant $T"
  check "storefront renders" "200" GET "$T" /
  check "internal cron is not served on the tenant host" "404" POST "$T" /api/internal/cron/retry-order-refunds
  check "admin upload is not served on the tenant host" "404" PUT "$T" /api/upload/x
fi

echo
if [ "$fail" -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; fi
exit "$fail"
