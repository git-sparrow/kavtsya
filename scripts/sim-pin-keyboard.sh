#!/usr/bin/env bash
# Pin an iOS simulator's keyboard to en_US before anything types into it.
#
# Usage: pnpm sim:pin-keyboard [UDID]   (default: the first booted simulator)
#
# Maestro's `inputText` and Argent's keyboard tool type through whatever layout
# iOS last had up, and iOS remembers it: with a Ukrainian keyboard installed it
# can come back on the Cyrillic layout, where the Latin characters of an email or
# password have no keys. The credential is typed partially and sign-in fails with
# «Invalid email or password», which looks nothing like a keyboard problem (#249,
# #440); on iOS 26.5, 2026-09-07, a Cyrillic layout truncated `demo-password-1`
# to three characters. Takes effect for the next keyboard iOS shows.
set -euo pipefail

udid="${1:-}"
if [[ -z "$udid" ]]; then
  udid="$(xcrun simctl list devices booted -j \
    | python3 -c 'import json,sys;d=json.load(sys.stdin)["devices"];print(next((x["udid"] for v in d.values() for x in v if x.get("state")=="Booted"),""))')"
fi
if [[ -z "$udid" ]]; then
  echo "✗ no booted iOS simulator to pin; boot one or pass its UDID" >&2
  exit 1
fi

xcrun simctl spawn "$udid" defaults write .GlobalPreferences AppleKeyboards \
  -array "en_US@sw=QWERTY;hw=Automatic" "emoji@sw=Emoji"
echo "▶ pinned simulator $udid's keyboard to en_US"
