// Lockfile moves of the packages .github/dependabot.yml leaves to the Expo track,
// transitive ones included: the `ignore` list stops Dependabot editing a manifest,
// not a re-resolution floating them. Policy: docs/agents/dependency-updates.md.
// Usage: node scripts/deps-check/expo-surface.mjs <base-ref>
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const DOC = "docs/agents/dependency-updates.md";

/** The `dependency-name` patterns of the npm ecosystem's `ignore` list. */
export function ignoredPatterns(dependabotYml) {
  const npm = dependabotYml
    .split(/^ {2}- package-ecosystem:/m)
    .find((entry) => entry.trimStart().startsWith('"npm"'));
  if (!npm) throw new Error("no npm entry in .github/dependabot.yml");
  return [...npm.matchAll(/^ +- dependency-name: "([^"]+)"/gm)].map(
    (m) => m[1],
  );
}

/** Resolved versions per package name, from the lockfile's `packages:` section. */
export function resolvedVersions(lockfile) {
  const section = lockfile.split(/^packages:$/m)[1]?.split(/^\S/m)[0];
  if (section === undefined)
    throw new Error("pnpm-lock.yaml has no packages: section");
  const versions = new Map();
  for (const [, name, version] of section.matchAll(
    /^ {2}'?(@?[^@\s']+)@([^':\s]+)'?:$/gm,
  )) {
    versions.set(name, [...(versions.get(name) ?? []), version]);
  }
  return versions;
}

const glob = (pattern) =>
  new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
  );

/** What a move must keep to count as drift: major.minor (0.minor on 0.x). */
const contract = (version) => version.split(/[.-]/).slice(0, 2).join(".");

/**
 * `errors`: a version of a governed package appears, disappears or changes its
 * major.minor. `warnings`: a patch move inside the same contract (drift inside an
 * SDK, not a defect on its own).
 */
export function expoSurfaceMoves(patterns, base, head) {
  const matchers = patterns.map(glob);
  const names = [...new Set([...base.keys(), ...head.keys()])]
    .filter((name) => matchers.some((m) => m.test(name)))
    .sort();
  const errors = [];
  const warnings = [];
  for (const name of names) {
    const before = (base.get(name) ?? []).sort();
    const after = (head.get(name) ?? []).sort();
    if (before.join() === after.join()) continue;
    const move = `${name}: ${before.join(", ") || "(none)"} -> ${after.join(", ") || "(none)"}`;
    const sameContract =
      before.length > 0 &&
      [...new Set(before.map(contract))].join() ===
        [...new Set(after.map(contract))].join();
    (sameContract ? warnings : errors).push(move);
  }
  return { errors, warnings };
}

function main() {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error("usage: node scripts/deps-check/expo-surface.mjs <base-ref>");
    process.exit(2);
  }
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  const baseLockfile = execFileSync(
    "git",
    ["show", `${baseRef}:pnpm-lock.yaml`],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const { errors, warnings } = expoSurfaceMoves(
    ignoredPatterns(read(".github/dependabot.yml")),
    resolvedVersions(baseLockfile),
    resolvedVersions(read("pnpm-lock.yaml")),
  );

  const report = [
    ...errors.map((m) => `- **moved:** \`${m}\``),
    ...warnings.map((m) => `- patch drift: \`${m}\``),
  ];
  if (process.env.GITHUB_STEP_SUMMARY && report.length > 0) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Expo surface\n\n${report.join("\n")}\n`,
    );
  }
  for (const move of warnings)
    console.log(`::warning title=Expo surface patch drift::${move}`);
  if (errors.length > 0) {
    console.error(
      `\nexpo-surface: automation moved Expo-track packages:\n${errors.map((m) => `- ${m}`).join("\n")}\n` +
        `They move only on the Expo track (${DOC}, "Transitive Expo packages float through the freeze").`,
    );
    process.exit(1);
  }
  console.log(
    `expo-surface: no Expo-track package left its contract (${warnings.length} patch moves)`,
  );
}

// Not `import.meta.main`: it needs Node 24.2 (doc/api/esm.md), and engines allows ^24.
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main();
}
