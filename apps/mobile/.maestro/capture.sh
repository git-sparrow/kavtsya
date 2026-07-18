#!/usr/bin/env bash
# Capture the docs/flows screenshot gallery by replaying the Maestro role flows
# against a running dev build + seeded demo world. Screenshots land in
# docs/flows/shots/<role>/, which docs/flows/README.md embeds.
#
# Usage:
#   APP_ID=<bundle-id> ./capture.sh          # customer + owner flows
#   APP_ID=<bundle-id> CAPTURE_SCANNER=1 ./capture.sh   # + scanner (needs an active shift)
#
# Prereqs (see docs/flows/README.md):
#   - Maestro installed:  curl -Ls https://get.maestro.mobile.dev | bash
#   - Stack up + seeded:  pnpm db:up && pnpm db:seed-demo && pnpm dev:api && pnpm dev:mobile
#   - A dev build of the app installed on the booted simulator.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"

APP_ID="${APP_ID:-com.kavtsya.app}"                        # app.json → expo.ios.bundleIdentifier
DEMO_PASSWORD="${DEMO_PASSWORD:-demo-password-1}"          # seed-world.ts universal password
SHOTS="${SHOTS:-$REPO/docs/flows/shots}"
SIGNUP_EMAIL="${SIGNUP_EMAIL:-signup+$(date +%s)@kavtsya.test}"  # unique per run → re-runnable

COMMON_ENV=(--env "APP_ID=$APP_ID" --env "DEMO_PASSWORD=$DEMO_PASSWORD"
            --env "SHOTS=$SHOTS" --env "SIGNUP_EMAIL=$SIGNUP_EMAIL")

mkdir -p "$SHOTS"/customer "$SHOTS"/owner "$SHOTS"/scanner

run() { echo "▶ $1"; maestro test "$HERE/$1" "${COMMON_ENV[@]}"; }

run 10-customer-signup.yaml
run 20-customer-core.yaml
run 30-owner.yaml
if [[ "${CAPTURE_SCANNER:-0}" == "1" ]]; then
  run 50-scanner.yaml
else
  echo "⏭  Skipping scanner flow (set CAPTURE_SCANNER=1 after starting a Зміна for barista@kavtsya.test)"
fi

echo "✓ Gallery captured → $SHOTS"
