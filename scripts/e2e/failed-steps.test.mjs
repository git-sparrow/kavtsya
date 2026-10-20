import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { failedStepReport, failedSteps } from "./failed-steps.mjs";

const fixture = (name) =>
  path.join(import.meta.dirname, "fixtures", `${name}.commands.json`);
const commands = (name) => JSON.parse(readFileSync(fixture(name), "utf8"));

// Trimmed from the e2e-android-38705010525-1 artifact: the device dropped
// after the APK installed, and Maestro's console never printed why.
const DEVICE_OFFLINE = "device-offline";
// Trimmed from demo run 39225037684 (#312 demo D): a deliberately broken assertion.
const ASSERTION_FAILED = "assertion-failed";

describe("failedSteps", () => {
  it("names the innermost failed command first, then the subflow it ran in", () => {
    assert.deepEqual(failedSteps(commands(DEVICE_OFFLINE)), [
      "launchApp — Command failed (host:transport:emulator-5554): device offline",
      "runFlow subflows/reset-to-signed-out.yaml — Command failed (host:transport:emulator-5554): device offline",
    ]);
  });

  it("skips optional commands that only warned", () => {
    assert.deepEqual(failedSteps(commands(ASSERTION_FAILED)), [
      'assertCondition — Assertion is false: "Зареєструватися-DEMO-312-D" is visible',
    ]);
  });

  it("uses a command's label and keeps a multi-line error on one line", () => {
    const labelled = [
      {
        command: { tapOnElement: { label: "Open Settings" } },
        metadata: {
          status: "FAILED",
          depth: 0,
          error: { message: "Element not found:\n  id: settings" },
        },
      },
    ];
    assert.deepEqual(failedSteps(labelled), [
      'tapOnElement "Open Settings" — Element not found: id: settings',
    ]);
  });
});

describe("failedStepReport", () => {
  it("reads the newest commands.json in a flow's output directory", () => {
    const out = mkdtempSync(path.join(tmpdir(), "failed-steps-"));
    writeCommands(out, "2026-10-15_083000", ASSERTION_FAILED);
    writeCommands(out, "2026-10-15_083516", DEVICE_OFFLINE);
    assert.match(
      failedStepReport(out),
      /^ {2}✗ step: launchApp — .*device offline$/m,
    );
    assert.doesNotMatch(failedStepReport(out), /Assertion is false/);
  });

  it("says the step detail is unavailable when Maestro wrote no commands.json", () => {
    const out = mkdtempSync(path.join(tmpdir(), "failed-steps-"));
    assert.equal(
      failedStepReport(out),
      `  ✗ step detail unavailable: no commands.json under ${out}`,
    );
  });

  it("says the step detail is unavailable when commands.json is unreadable", () => {
    const out = mkdtempSync(path.join(tmpdir(), "failed-steps-"));
    mkdirSync(path.join(out, "t", "flow"), { recursive: true });
    writeFileSync(path.join(out, "t", "flow", "commands.json"), "[{");
    assert.match(failedStepReport(out), /^ {2}✗ step detail unavailable: /);
  });
});

function writeCommands(out, timestamp, name) {
  const dir = path.join(out, timestamp, "10-customer-signup");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "commands.json"), readFileSync(fixture(name)));
}
