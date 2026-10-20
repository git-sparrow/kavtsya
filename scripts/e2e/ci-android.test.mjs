import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
// Trimmed from hosted artifacts; see failed-steps.test.mjs.
const fixture = (name) =>
  path.join(import.meta.dirname, "fixtures", `${name}.commands.json`);
const DEVICE_OFFLINE = "device-offline";
const ASSERTION_FAILED = "assertion-failed";

// The CI glue end to end, with adb, Maestro and pnpm stubbed: a healthy
// emulator, then a first flow that fails the way the fixture records.
describe("ci-android.sh", () => {
  function runSuite(fixtureName) {
    const tmp = mkdtempSync(path.join(tmpdir(), "ci-android-"));
    const bin = path.join(tmp, "bin");
    mkdirSync(bin);
    stub(bin, "adb", ADB_STUB);
    stub(bin, "maestro", MAESTRO_STUB);
    stub(bin, "pnpm", "exit 0");
    // capture.sh pins the iOS simulator keyboard; never touch a real simulator.
    stub(bin, "xcrun", "exit 1");
    const result = spawnSync(
      "bash",
      [path.join(root, "apps/mobile/.maestro/ci-android.sh")],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          APK: path.join(tmp, "app-debug.apk"),
          ARTIFACTS: path.join(tmp, "maestro"),
          SHOTS: path.join(tmp, "shots"),
          STUB_FIXTURE: fixtureName ? fixture(fixtureName) : "",
          STUB_MAESTRO_VERSION: readFileSync(
            path.join(root, "apps/mobile/.maestro/maestro-version"),
            "utf8",
          ).trim(),
        },
      },
    );
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      suiteLog: readFileSync(path.join(tmp, "maestro", "suite.log"), "utf8"),
    };
  }

  const INFRA = "::error title=E2E infrastructure failure";

  it("names a transport error at the first launch as an infrastructure failure", () => {
    const { status, output, suiteLog } = runSuite(DEVICE_OFFLINE);
    assert.equal(status, 1);
    assert.match(suiteLog, /✗ step: launchApp — .*device offline/);
    assert.ok(output.includes(INFRA), output);
  });

  it("keeps an app failure red without the infrastructure verdict", () => {
    const { status, output, suiteLog } = runSuite(ASSERTION_FAILED);
    assert.equal(status, 1);
    assert.match(suiteLog, /✗ step: assertCondition — Assertion is false/);
    assert.ok(!output.includes(INFRA), output);
  });

  it("still fails when Maestro wrote no commands.json", () => {
    const { status, output, suiteLog } = runSuite(null);
    assert.equal(status, 1);
    assert.match(suiteLog, /✗ step detail unavailable: no commands\.json/);
    assert.ok(!output.includes(INFRA), output);
  });
});

function stub(bin, name, body) {
  const file = path.join(bin, name);
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
}

const ADB_STUB = `
case "$*" in
  get-state) echo device ;;
  "shell getprop sys.boot_completed") echo 1 ;;
  "shell pm path android") echo package:/system/framework/framework-res.apk ;;
  "shell dumpsys window") echo "  mCurrentFocus=Window{1 u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity}" ;;
esac
exit 0`;

// Fails every flow, writing the fixture where Maestro 2.7 puts commands.json.
const MAESTRO_STUB = `
if [[ "$1" == --version ]]; then echo "$STUB_MAESTRO_VERSION"; exit 0; fi
while (( $# )); do
  case "$1" in --test-output-dir) out="$2"; shift ;; esac
  shift
done
if [[ -n "$STUB_FIXTURE" ]]; then
  mkdir -p "$out/2026-10-15_083516/flow"
  cp "$STUB_FIXTURE" "$out/2026-10-15_083516/flow/commands.json"
fi
exit 1`;
