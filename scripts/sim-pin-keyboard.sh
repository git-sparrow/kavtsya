#!/usr/bin/env bash
# Pin an iOS simulator's keyboard to en_US before anything types into it: Maestro
# and Argent type through whatever layout iOS last had up, and on a Cyrillic layout
# the Latin characters of a credential have no keys (docs/flows/README.md).
#
# Usage: pnpm sim:pin-keyboard [UDID]   (default: the first booted simulator)
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
