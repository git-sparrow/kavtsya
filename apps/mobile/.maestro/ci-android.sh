#!/usr/bin/env bash
# CI glue for the Android E2E pilot (#246): install the debug APK on the booted
# emulator, point it at this runner's Metro + API, then hand over to capture.sh —
# the one home of the suite. Runs inside android-emulator-runner's `script`, which
# executes each line in its own shell, hence a file rather than inline steps.
#
# Expects: an emulator booted, Metro on :8081 and the API on :3000 (both on this
# host), the demo world seeded, and the pinned Maestro on PATH.
#
# The hosted runner is sometimes too slow for its emulator (#312): the launcher
# hangs behind an "isn't responding" dialog, adb drops the device at the first
# launch, or the emulator vanishes mid-suite. None of that may read as an app
# failure, so this script hardens the device before the suite and names an
# infrastructure failure as one. Such a run still fails.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APK="${APK:?path to the debug APK}"
ARTIFACTS="${ARTIFACTS:?Maestro artifacts dir}"
SUITE_LOG="$ARTIFACTS/suite.log"
READY_TIMEOUT_S=180

infra_failure() {
  echo "::error title=E2E infrastructure failure, not an app failure::$1"
  exit 1
}

adb_connected() {
  [[ "$(adb get-state 2>/dev/null)" == device ]]
}

focused_window() {
  adb shell dumpsys window 2>/dev/null | sed -n 's/^  mCurrentFocus=//p' | tr -d '\r'
}

device_online() {
  adb_connected \
    && [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]] \
    && adb shell pm path android >/dev/null 2>&1
}

# A process that stops responding is then killed instead of covering the app with
# an "isn't responding" dialog. Our own app hanging or crashing still fails its
# flow, because it dies; the cause is in the flow artifact's device logcat, not
# on its failure screenshot. The setting leaves a dialog that is already up, so
# close that too. Both verified on an API 35 emulator, 2026-10-19 (#312).
suppress_system_dialogs() {
  adb shell settings put global hide_error_dialogs 1 \
    && adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null \
    || infra_failure "could not suppress system dialogs on the emulator"
}

sleep_or_give_up() { # <start seconds> <last focus>
  if (( SECONDS - $1 >= READY_TIMEOUT_S )); then
    infra_failure "emulator not usable after ${READY_TIMEOUT_S}s (adb state: $(adb get-state 2>&1 || true); focus: ${2:-none})"
  fi
  sleep 2
}

# android-emulator-runner waits only for `sys.boot_completed` (its job log polls
# exactly that), and adb can still report the device offline after it, with the
# launcher hung. Wait for an online device with a responsive package manager,
# then for a focused activity: `dumpsys window` names an activity
# `u0 package/Activity`, an ANR dialog `u0 Application Not Responding: package`
# (both observed on an API 35 emulator, 2026-10-19).
wait_until_usable() {
  local start=$SECONDS focus=""
  until device_online; do sleep_or_give_up "$start" "$focus"; done
  suppress_system_dialogs
  until focus="$(focused_window)" && [[ "$focus" == *" u0 "*/* ]]; do
    sleep_or_give_up "$start" "$focus"
  done
  echo "▶ emulator usable after $(( SECONDS - start ))s (focus: $focus)"
}

wait_until_usable

adb install -r "$APK" || infra_failure "could not install the debug APK on the emulator"
# The debug build fetches its JS from Metro and derives the API host from the
# bundle URL (auth-client.ts). Reverse both ports so either `localhost` or the
# emulator's host alias resolves to this runner.
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:3000 tcp:3000 \
  || infra_failure "could not reverse the Metro and API ports to the emulator"

mkdir -p "$ARTIFACTS"
status=0
CAPTURE_SCANNER=1 "$HERE/capture.sh" 2>&1 | tee "$SUITE_LOG" || status=$?
if (( status != 0 )) && { ! adb_connected \
  || grep -qE "DeviceServerDiedException|device offline|device '[^']*' not found" "$SUITE_LOG"; }; then
  infra_failure "adb lost the emulator during the suite; any flow that failed before that is in suite.log in the e2e-android artifact"
fi
exit "$status"
