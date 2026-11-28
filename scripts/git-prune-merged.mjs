// Removes local branches, and their worktrees, whose pull request has merged.
// Prints the plan by default; `--apply` carries it out. Policy:
// docs/agents/workflow.md, "Working concurrently".
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { withDbPort } from "./env-worktree.mjs";
import { parseWorktrees } from "./worktrees.mjs";

/** Ignored paths a fresh install or build recreates; anything else ignored may exist nowhere else. */
const DISPOSABLE = [
  "node_modules/",
  ".expo/",
  "dist/",
  "web-build/",
  "ios/",
  "android/",
  ".astro/",
  ".husky/_/",
  "coverage/",
  "apps/web/src/styles/tokens.css",
];

/**
 * Whether a worktree's `.env` is exactly what `pnpm env:worktree` would write
 * now from the main checkout's: nothing in it is edited by hand.
 */
export function isProvisionedEnv(worktreeEnv, mainEnv) {
  const port = parseEnv(worktreeEnv).DB_PORT;
  return /^\d+$/.test(port ?? "") && worktreeEnv === withDbPort(mainEnv, port);
}

/**
 * The lines of `git status --porcelain --untracked-files=all --ignored=matching`
 * that hold work. `provisionedEnv` marks the root `.env` as regenerable.
 */
export function workAtStake(statusPorcelain, { provisionedEnv = false } = {}) {
  return statusPorcelain
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      if (!line.startsWith("!! ")) return true;
      const file = line.slice(3);
      if (provisionedEnv && file === ".env") return false;
      return !DISPOSABLE.some(
        (dir) => file.startsWith(dir) || file.includes(`/${dir}`),
      );
    });
}

/**
 * One decision per local branch. `branches` is [{ name, tip }], `mergedPrs` is
 * [{ number, headRefName, headRefOid }], `statusByPath` maps a worktree path to
 * its `workAtStake` lines.
 */
export function planPrune({ worktrees, branches, mergedPrs, statusByPath }) {
  const mainBranch = worktrees.find((tree) => tree.main)?.branch;
  return branches.map(({ name, tip }) => {
    const worktree = worktrees.find((tree) => tree.branch === name) ?? null;
    const keep = (reason) => ({
      branch: name,
      worktree,
      action: "keep",
      reason,
    });

    if (name === "main" || name === mainBranch) {
      return keep("checked out in the main checkout");
    }
    const prs = mergedPrs.filter((pr) => pr.headRefName === name);
    if (prs.length === 0) return keep("no merged pull request");
    const pr = prs.find((candidate) => candidate.headRefOid === tip);
    if (!pr) return keep("has commits its merged pull request lacks");
    if (worktree?.locked) return keep(`worktree ${worktree.path} is locked`);
    const stake = worktree ? (statusByPath[worktree.path] ?? []) : [];
    if (stake.length > 0) {
      return keep(`worktree ${worktree.path} holds work: ${stake.join(", ")}`);
    }
    return {
      branch: name,
      worktree,
      action: "prune",
      reason: `merged as #${pr.number}`,
    };
  });
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * Carries out the prune decisions. A worktree's Postgres (its Compose project,
 * container and volume) goes before the worktree does; when that fails the
 * worktree and branch stay, so a later run finishes the job. Returns the
 * `{ branch, reason }` of each one kept.
 */
export function applyPrune(
  decisions,
  { composeDown, removeWorktree, deleteBranch, log },
) {
  const kept = [];
  for (const { branch, worktree } of decisions) {
    if (worktree) {
      try {
        composeDown(worktree.path);
      } catch (error) {
        const reason = `docker compose down -v failed in ${worktree.path}: ${error.stderr?.trim() || error.message}`;
        kept.push({ branch, reason });
        log(`kept   ${branch}: ${reason}`);
        continue;
      }
      removeWorktree(worktree.path);
    }
    deleteBranch(branch);
    log(`pruned ${branch}`);
  }
  return kept;
}

const mainEnvOf = (worktrees) => {
  const file = path.join(worktrees.find((tree) => tree.main).path, ".env");
  return existsSync(file) ? readFileSync(file, "utf8") : null;
};

function main() {
  const apply = process.argv.includes("--apply");
  const worktrees = parseWorktrees(git(["worktree", "list", "--porcelain"]));
  const branches = git([
    "for-each-ref",
    "--format=%(refname:short) %(objectname)",
    "refs/heads",
  ])
    .trim()
    .split("\n")
    .map((line) => {
      const [name, tip] = line.split(" ");
      return { name, tip };
    });
  const mergedPrs = JSON.parse(
    execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "merged",
        "--limit",
        "1000",
        "--json",
        "number,headRefName,headRefOid",
      ],
      { encoding: "utf8" },
    ),
  );
  const mainEnv = mainEnvOf(worktrees);
  const provisioned = (tree) => {
    const file = path.join(tree.path, ".env");
    return (
      mainEnv !== null &&
      existsSync(file) &&
      isProvisionedEnv(readFileSync(file, "utf8"), mainEnv)
    );
  };
  const statusByPath = Object.fromEntries(
    worktrees
      .filter((tree) => !tree.main)
      .map((tree) => [
        tree.path,
        workAtStake(
          git(
            [
              "status",
              "--porcelain",
              "--untracked-files=all",
              "--ignored=matching",
            ],
            tree.path,
          ),
          { provisionedEnv: provisioned(tree) },
        ),
      ]),
  );

  const plan = planPrune({ worktrees, branches, mergedPrs, statusByPath });
  for (const { branch, worktree, action, reason } of plan) {
    const where =
      worktree && !worktree.main ? ` (${path.basename(worktree.path)})` : "";
    const postgres =
      action === "prune" && worktree
        ? "; its Postgres goes too (docker compose down -v)"
        : "";
    console.log(`${action.padEnd(5)} ${branch}${where}: ${reason}${postgres}`);
  }

  const prunable = plan.filter((decision) => decision.action === "prune");
  if (!apply) {
    if (prunable.length > 0)
      console.log(`\nRun with --apply to prune ${prunable.length}.`);
    return;
  }
  const kept = applyPrune(prunable, {
    composeDown: (cwd) =>
      execFileSync("docker", ["compose", "down", "-v"], {
        cwd,
        encoding: "utf8",
        stdio: "pipe",
      }),
    // --force: workAtStake has cleared every file but disposable build output.
    removeWorktree: (dir) => git(["worktree", "remove", "--force", dir]),
    deleteBranch: (name) => git(["branch", "-D", name]),
    log: console.log,
  });
  git(["worktree", "prune"]);
  if (kept.length > 0) process.exitCode = 1;
}

// Not `import.meta.main`: matches scripts/deps-check/check-deps.mjs.
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main();
}
