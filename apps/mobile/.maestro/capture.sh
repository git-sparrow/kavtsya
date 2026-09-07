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

# Maestro installs to ~/.maestro/bin; make it resolvable even from a shell that
# hasn't sourced the user's profile (CI, non-interactive runners).
export PATH="$HOME/.maestro/bin:$PATH"

# Opt out of Maestro's anonymous analytics for every capture run.
export MAESTRO_CLI_NO_ANALYTICS=1

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"

APP_ID="${APP_ID:-com.kavtsya.app}"                        # standalone dev build (app.json bundleIdentifier)
DEMO_PASSWORD="${DEMO_PASSWORD:-demo-password-1}"          # seed-world.ts universal password
SHOTS="${SHOTS:-$REPO/docs/flows/shots}"
SIGNUP_EMAIL="${SIGNUP_EMAIL:-signup+$(date +%s)@kavtsya.test}"  # unique per run → re-runnable

COMMON_ENV=(--env "APP_ID=$APP_ID" --env "DEMO_PASSWORD=$DEMO_PASSWORD"
            --env "SHOTS=$SHOTS" --env "SIGNUP_EMAIL=$SIGNUP_EMAIL")

mkdir -p "$SHOTS"/customer "$SHOTS"/owner "$SHOTS"/scanner

# Pin the simulator's software keyboard to a Latin layout before typing anything.
# `inputText` types through whatever keyboard iOS last had up, and iOS remembers
# that choice: with a Ukrainian keyboard installed it can come back on the
# Cyrillic layout, where the Latin characters of an email/password simply have no
# keys. The credential is then typed *partially* and sign-in fails with «Invalid
# email or password» — a red herring that looks nothing like a keyboard problem.
# Verified on iOS 26.5 / Maestro 2.6.1, 2026-09-07: a Cyrillic layout truncated
# `demo-password-1` to three characters.
pin_latin_keyboard() {
  local udid
  # Guarded end to end: a missing simulator, a python hiccup or a read-only
  # defaults domain must not abort the capture under `set -euo pipefail` — the
  # keyboard is a nicety, the gallery is the job.
  udid="$(xcrun simctl list devices booted -j 2>/dev/null \
    | python3 -c 'import json,sys;d=json.load(sys.stdin)["devices"];print(next((x["udid"] for v in d.values() for x in v if x.get("state")=="Booted"),""))' \
    2>/dev/null || true)"
  [[ -n "$udid" ]] || return 0
  xcrun simctl spawn "$udid" defaults write .GlobalPreferences AppleKeyboards \
    -array "en_US@sw=QWERTY;hw=Automatic" "emoji@sw=Emoji" 2>/dev/null || return 0
  echo "▶ pinned the simulator keyboard to en_US (see #249)"
}
pin_latin_keyboard

run() { echo "▶ $1"; maestro test "$HERE/$1" "${COMMON_ENV[@]}"; }

# Clean slate: end any lingering Зміна so a prior scanner run's kiosk (which has
# no sign-out) can't strand the first flow's reset. Makes the suite re-runnable.
pnpm --filter @kavtsya/api demo-shift end

run 10-customer-signup.yaml
run 20-customer-core.yaml
run 30-owner.yaml
run 40-owner-onboarding.yaml
if [[ "${CAPTURE_SCANNER:-0}" == "1" ]]; then
  # Scanner Mode only exists during an active Зміна — grant one for the barista
  # (idempotent) before signing in as them. Run scanner LAST: it ends signed in
  # to the kiosk, which has no Settings-gear sign-out (the next run's clean-slate
  # `demo-shift end` above clears it).
  echo "▶ granting active Зміна for barista@kavtsya.test"
  pnpm --filter @kavtsya/api demo-shift start
  run 50-scanner.yaml
else
  echo "⏭  Skipping scanner flow (set CAPTURE_SCANNER=1 to grant a Зміна + capture the kiosk)"
fi

echo "✓ Gallery captured → $SHOTS"
