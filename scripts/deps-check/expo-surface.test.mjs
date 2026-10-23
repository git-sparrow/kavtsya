import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  expoSurfaceMoves,
  ignoredPatterns,
  resolvedVersions,
} from "./expo-surface.mjs";

const root = path.resolve(import.meta.dirname, "../..");

const lockfile = (...keys) =>
  `lockfileVersion: '9.0'\n\npackages:\n\n${keys.map((k) => `  ${k}:\n    resolution: {}\n`).join("\n")}\nsnapshots:\n\n  expo@99.0.0: {}\n`;

describe("ignoredPatterns", () => {
  it("reads the npm ignore list and not the other ecosystems", () => {
    const yml = [
      "updates:",
      '  - package-ecosystem: "npm"',
      "    ignore:",
      '      - dependency-name: "expo"',
      '      - dependency-name: "@expo/*"',
      '        versions: [">=1.3.0"]',
      '  - package-ecosystem: "github-actions"',
      "    ignore:",
      '      - dependency-name: "actions/checkout"',
    ].join("\n");
    assert.deepEqual(ignoredPatterns(yml), ["expo", "@expo/*"]);
  });

  it("covers the Expo surface in the real config", () => {
    const patterns = ignoredPatterns(
      readFileSync(path.join(root, ".github/dependabot.yml"), "utf8"),
    );
    for (const name of [
      "expo",
      "expo-*",
      "@expo/*",
      "react",
      "react-native",
      "react-native-*",
      "@types/react",
    ]) {
      assert.ok(patterns.includes(name), name);
    }
  });
});

describe("resolvedVersions", () => {
  it("collects every version per name from packages:, not snapshots:", () => {
    const versions = resolvedVersions(
      lockfile("'@expo/cli@57.0.18'", "expo@57.0.29", "expo@57.0.30"),
    );
    assert.deepEqual(versions.get("@expo/cli"), ["57.0.18"]);
    assert.deepEqual(versions.get("expo"), ["57.0.29", "57.0.30"]);
  });

  it("parses the real lockfile", () => {
    const versions = resolvedVersions(
      readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8"),
    );
    assert.ok(versions.get("expo")?.length >= 1);
  });
});

describe("expoSurfaceMoves", () => {
  const patterns = ["expo", "expo-*", "@expo/*", "react"];
  const moves = (base, head) =>
    expoSurfaceMoves(
      patterns,
      resolvedVersions(lockfile(...base)),
      resolvedVersions(lockfile(...head)),
    );

  it("passes an unchanged surface, whatever else moved", () => {
    assert.deepEqual(
      moves(["expo@57.0.29", "zod@4.6.7"], ["expo@57.0.29", "zod@4.7.0"]),
      {
        errors: [],
        warnings: [],
      },
    );
  });

  it("warns on a patch move inside the same contract", () => {
    assert.deepEqual(moves(["'@expo/cli@57.0.18'"], ["'@expo/cli@57.0.20'"]), {
      errors: [],
      warnings: ["@expo/cli: 57.0.18 -> 57.0.20"],
    });
  });

  it("fails a minor move, a fork, an addition and a removal", () => {
    const { errors } = moves(
      ["react@19.2.3", "'@expo/dom-webview@56.0.5'", "expo-network@57.0.2"],
      [
        "react@19.3.0",
        "'@expo/dom-webview@56.0.5'",
        "'@expo/dom-webview@57.0.1'",
        "expo-blur@57.0.1",
      ],
    );
    assert.deepEqual(errors, [
      "@expo/dom-webview: 56.0.5 -> 56.0.5, 57.0.1",
      "expo-blur: (none) -> 57.0.1",
      "expo-network: 57.0.2 -> (none)",
      "react: 19.2.3 -> 19.3.0",
    ]);
  });

  it("fails a 0.x minor, the breaking slot", () => {
    const { errors } = expoSurfaceMoves(
      ["expo-*"],
      new Map([["expo-x", ["0.4.1"]]]),
      new Map([["expo-x", ["0.5.0"]]]),
    );
    assert.deepEqual(errors, ["expo-x: 0.4.1 -> 0.5.0"]);
  });
});
