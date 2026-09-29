#!/usr/bin/env bash
# CI glue for the Android E2E pilot (#246): install the debug APK on the booted
# emulator, point it at this runner's Metro + API, then hand over to capture.sh —
# the one home of the suite. Runs inside android-emulator-runner's `script`, which
# executes each line in its own shell, hence a file rather than inline steps.
#
# Expects: an emulator booted, Metro on :8081 and the API on :3000 (both on this
# host), the demo world seeded, and the pinned Maestro on PATH.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APK="${APK:?path to the debug APK}"

adb install -r "$APK"
# The debug build fetches its JS from Metro and derives the API host from the
# bundle URL (auth-client.ts). Reverse both ports so either `localhost` or the
# emulator's host alias resolves to this runner.
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000

CAPTURE_SCANNER=1 "$HERE/capture.sh"
