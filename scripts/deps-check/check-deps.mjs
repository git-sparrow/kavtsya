// Dependency-graph invariants that a lockfile change can break while install,
// typecheck and tests stay green. Policy: docs/agents/dependency-updates.md.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const DOC = "docs/agents/dependency-updates.md";

/** Packages that put a workspace on the Expo graph; apps/api must resolve none. */
const EXPO_GRAPH = ["expo", "react-native"];

/** `why` is the parsed `pnpm why -r <name> --filter @kavtsya/api --json`. */
export function expoGraphProblem(name, why) {
  if (why.length === 0) return null;
  const versions = [...new Set(why.map((resolved) => resolved.version))];
  return (
    `apps/api resolves ${name}@${versions.join(", ")}; it must stay off the Expo graph ` +
    `(${DOC}, "Peers are declared, never auto-installed")`
  );
}

export function reactDomProblem(lockfile) {
  const entries = lockfile.match(/^ {2}react-dom@/gm)?.length ?? 0;
  if (entries === 0) return null;
  return `pnpm-lock.yaml has ${entries} react-dom@ entries; nothing may install react-dom (${DOC}, "Do not add react-dom")`;
}

function main() {
  const problems = [];

  const peers = spawnSync("pnpm", ["peers", "check"], {
    cwd: root,
    stdio: "inherit",
  });
  if (peers.status === null) {
    problems.push(
      `could not run pnpm peers check (${peers.error?.message ?? peers.signal})`,
    );
  } else if (peers.status !== 0) {
    problems.push(
      `pnpm peers check reports the issues above; declare each peer or list it in peerDependencyRules.ignoreMissing (${DOC}, "Peers are declared, never auto-installed")`,
    );
  }
  for (const name of EXPO_GRAPH) {
    const why = JSON.parse(
      execFileSync(
        "pnpm",
        ["why", "-r", name, "--filter", "@kavtsya/api", "--json"],
        { cwd: root, encoding: "utf8" },
      ),
    );
    problems.push(expoGraphProblem(name, why));
  }
  problems.push(
    reactDomProblem(readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8")),
  );

  const found = problems.filter(Boolean);
  if (found.length > 0) {
    console.error(
      `\ndeps:check failed:\n${found.map((p) => `- ${p}`).join("\n")}`,
    );
    process.exit(1);
  }
  console.log("deps:check: dependency graph OK");
}

// Not `import.meta.main`: it needs Node 24.2 (doc/api/esm.md), and engines allows ^24.
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main();
}
