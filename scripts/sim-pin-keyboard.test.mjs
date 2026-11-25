import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "sim-pin-keyboard.sh",
);

/** Runs the script with a stub `xcrun` that reports `booted` and logs its calls. */
function run(booted, args = []) {
  const dir = mkdtempSync(path.join(tmpdir(), "sim-pin-keyboard-"));
  const log = path.join(dir, "calls.log");
  const devices = { devices: { "iOS-26-5": booted } };
  writeFileSync(path.join(dir, "devices.json"), JSON.stringify(devices));
  writeFileSync(
    path.join(dir, "xcrun"),
    `#!/bin/sh
echo "$*" >> "${log}"
if [ "$1 $2" = "simctl list" ]; then cat "${dir}/devices.json"; fi
`,
  );
  chmodSync(path.join(dir, "xcrun"), 0o755);
  const result = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
  });
  let calls = [];
  try {
    calls = readFileSync(log, "utf8").trim().split("\n");
  } catch {}
  return { ...result, writes: calls.filter((c) => c.includes("defaults")) };
}

const KEYBOARDS =
  "defaults write .GlobalPreferences AppleKeyboards -array en_US@sw=QWERTY;hw=Automatic emoji@sw=Emoji";

test("pins the booted simulator's keyboard to en_US", () => {
  const { status, writes } = run([{ udid: "SIM-A", state: "Booted" }]);
  assert.equal(status, 0);
  assert.deepEqual(writes, [`simctl spawn SIM-A ${KEYBOARDS}`]);
});

test("targets the simulator named on the command line", () => {
  const { status, writes } = run(
    [
      { udid: "SIM-A", state: "Booted" },
      { udid: "SIM-B", state: "Booted" },
    ],
    ["SIM-B"],
  );
  assert.equal(status, 0);
  assert.deepEqual(writes, [`simctl spawn SIM-B ${KEYBOARDS}`]);
});

test("fails and says so when no simulator is booted", () => {
  const { status, stderr, writes } = run([
    { udid: "SIM-A", state: "Shutdown" },
  ]);
  assert.notEqual(status, 0);
  assert.match(stderr, /no booted iOS simulator/);
  assert.deepEqual(writes, []);
});
