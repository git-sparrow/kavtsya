import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditSection,
  changelogSection,
  githubRepo,
  runtimeBumps,
  versionsBetween,
} from "./gather.mjs";

const audit = (advisories) =>
  JSON.stringify({
    advisories,
    metadata: {
      vulnerabilities: { low: 0, high: Object.keys(advisories).length },
    },
  });
const ADVISORY = {
  1: { severity: "high", module_name: "hono", github_advisory_id: "GHSA-1" },
};

describe("auditSection", () => {
  it("lists advisories the PR adds", () => {
    const section = auditSection(audit({}), audit(ADVISORY));
    assert.match(
      section,
      /Advisories on the PR but not on the base:\n- high hono GHSA-1/,
    );
  });

  it("says when nothing is new", () => {
    assert.match(
      auditSection(audit(ADVISORY), audit(ADVISORY)),
      /No advisory on the PR that the base lacks\./,
    );
  });

  for (const [label, raw] of [
    ["an error report", '{"error":{"message":"registry unavailable"}}'],
    ["empty output", ""],
  ]) {
    it(`never reads ${label} as "no new advisories"`, () => {
      const section = auditSection(audit({}), raw);
      assert.match(section, /AUDIT UNAVAILABLE for the PR/);
      assert.doesNotMatch(section, /No advisory/);
    });
  }
});

const lockfile = (deps) =>
  "importers:\n\n  apps/api:\n    dependencies:\n" +
  Object.entries(deps)
    .map(
      ([name, version]) =>
        `      '${name}':\n        specifier: ^1\n        version: ${version}\n`,
    )
    .join("") +
  "    devDependencies:\n      vitest:\n        specifier: ^5\n        version: 5.0.4\n\n  apps/mobile:\n";

describe("runtimeBumps", () => {
  it("returns changed and new apps/api runtime deps, not links or devDependencies", () => {
    const base = lockfile({
      hono: "4.13.8",
      zod: "4.6.7",
      shared: "link:../../packages/shared",
    });
    const pr = lockfile({
      hono: "4.13.13",
      zod: "4.6.7",
      shared: "link:../../packages/shared",
      "better-auth": "1.7.7(pg@8.23.1)",
    });
    assert.deepEqual(runtimeBumps(base, pr), [
      { name: "hono", from: "4.13.8", to: "4.13.13" },
      { name: "better-auth", from: undefined, to: "1.7.7" },
    ]);
  });
});

describe("versionsBetween", () => {
  it("keeps stable versions after `from` up to `to`, in order", () => {
    const all = ["4.13.10", "4.13.8", "4.13.9", "4.13.12-beta.1", "4.13.14"];
    assert.deepEqual(versionsBetween(all, "4.13.8", "4.13.10"), [
      "4.13.9",
      "4.13.10",
    ]);
  });
});

describe("changelogSection", () => {
  const text =
    "# Changelog\n\n## pg@8.23.10\n\nlater\n\n## pg@8.23.1\n\n- fix\n\n### Detail\n\nmore\n\n## pg@8.23.0\n\nolder\n";

  it("returns the section for the exact version, subsections included", () => {
    assert.equal(
      changelogSection(text, "8.23.1"),
      "- fix\n\n### Detail\n\nmore",
    );
  });

  it("returns null when no heading names the version", () => {
    assert.equal(changelogSection(text, "8.23.2"), null);
  });
});

describe("githubRepo", () => {
  it("reads owner/repo from npm repository URLs", () => {
    assert.equal(
      githubRepo("git://github.com/brianc/node-postgres.git"),
      "brianc/node-postgres",
    );
    assert.equal(
      githubRepo("git+https://github.com/honojs/hono.git"),
      "honojs/hono",
    );
    assert.equal(githubRepo("https://gitlab.com/a/b"), null);
  });
});
