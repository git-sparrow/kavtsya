// Removes local branches, and their worktrees, whose pull request has merged.
// Prints the plan by default; `--apply` carries it out. Policy:
// docs/agents/workflow.md, "Working concurrently".
import { execFileSync } from "node:child_process";
import path from "node:path";

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
];

/** Parses `git worktree list --porcelain`; the first entry is the main checkout. */
export function parseWorktrees(porcelain) {
  return porcelain
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block, index) => {
      const lines = block.split("\n");
      const field = (key) =>
        lines.find((line) => line === key || line.startsWith(`${key} `));
      return {
        path: field("worktree").slice("worktree ".length),
        branch: field("branch")?.slice("branch refs/heads/".length) ?? null,
        locked: Boolean(field("locked")),
        main: index === 0,
      };
    });
}

/** The lines of `git status --porcelain --untracked-files=all --ignored=matching` that hold work. */
export function workAtStake(statusPorcelain) {
  return statusPorcelain
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      if (!line.startsWith("!! ")) return true;
      const file = line.slice(3);
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
        ),
      ]),
  );

  const plan = planPrune({ worktrees, branches, mergedPrs, statusByPath });
  for (const { branch, worktree, action, reason } of plan) {
    const where =
      worktree && !worktree.main ? ` (${path.basename(worktree.path)})` : "";
    console.log(`${action.padEnd(5)} ${branch}${where}: ${reason}`);
  }

  const prunable = plan.filter((decision) => decision.action === "prune");
  if (!apply) {
    if (prunable.length > 0)
      console.log(`\nRun with --apply to prune ${prunable.length}.`);
    return;
  }
  for (const { branch, worktree } of prunable) {
    // --force: workAtStake has cleared every file but disposable build output.
    if (worktree) git(["worktree", "remove", "--force", worktree.path]);
    git(["branch", "-D", branch]);
    console.log(`pruned ${branch}`);
  }
  git(["worktree", "prune"]);
}

// Not `import.meta.main`: matches scripts/deps-check/check-deps.mjs.
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main();
}
