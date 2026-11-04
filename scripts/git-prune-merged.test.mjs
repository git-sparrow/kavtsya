import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWorktrees, planPrune, workAtStake } from "./git-prune-merged.mjs";

const MAIN = { path: "/repo", branch: "main", locked: false, main: true };
const tree = (branch, extra = {}) => ({
  path: `/repo-${branch}`,
  branch,
  locked: false,
  main: false,
  ...extra,
});
const merged = (headRefName, headRefOid, number = 1) => ({
  number,
  headRefName,
  headRefOid,
});

function decide({ branch, tip = "aaa", worktree, prs = [], stake = [] }) {
  const worktrees = worktree ? [MAIN, worktree] : [MAIN];
  const [decision] = planPrune({
    worktrees,
    branches: [{ name: branch, tip }],
    mergedPrs: prs,
    statusByPath: worktree ? { [worktree.path]: stake } : {},
  });
  return decision;
}

describe("planPrune", () => {
  it("prunes a branch whose tip is a merged pull request's head", () => {
    const decision = decide({
      branch: "fix/a",
      prs: [merged("fix/a", "aaa", 7)],
    });
    assert.equal(decision.action, "prune");
    assert.equal(decision.reason, "merged as #7");
  });

  it("prunes a clean worktree together with its merged branch", () => {
    const worktree = tree("fix/a");
    const decision = decide({
      branch: "fix/a",
      worktree,
      prs: [merged("fix/a", "aaa")],
    });
    assert.equal(decision.action, "prune");
    assert.equal(decision.worktree, worktree);
  });

  it("keeps a branch with no merged pull request", () => {
    assert.equal(decide({ branch: "feat/b" }).reason, "no merged pull request");
  });

  it("keeps a branch with commits after its pull request merged", () => {
    const decision = decide({
      branch: "fix/a",
      tip: "bbb",
      prs: [merged("fix/a", "aaa")],
    });
    assert.equal(decision.reason, "has commits its merged pull request lacks");
  });

  it("matches the right pull request when a branch name was reused", () => {
    const prs = [merged("fix/a", "old", 3), merged("fix/a", "aaa", 9)];
    assert.equal(decide({ branch: "fix/a", prs }).reason, "merged as #9");
  });

  it("keeps a merged branch whose worktree holds work", () => {
    const decision = decide({
      branch: "fix/a",
      worktree: tree("fix/a"),
      prs: [merged("fix/a", "aaa")],
      stake: ["?? notes.md", "!! apps/api/.env"],
    });
    assert.equal(decision.action, "keep");
    assert.match(
      decision.reason,
      /holds work: \?\? notes\.md, !! apps\/api\/\.env$/,
    );
  });

  it("keeps a merged branch whose worktree is locked", () => {
    const decision = decide({
      branch: "fix/a",
      worktree: tree("fix/a", { locked: true }),
      prs: [merged("fix/a", "aaa")],
    });
    assert.match(decision.reason, /is locked$/);
  });

  it("keeps the branch the main checkout is on, even when merged", () => {
    const [decision] = planPrune({
      worktrees: [{ ...MAIN, branch: "chore/x" }],
      branches: [{ name: "chore/x", tip: "aaa" }],
      mergedPrs: [merged("chore/x", "aaa")],
      statusByPath: {},
    });
    assert.equal(decision.reason, "checked out in the main checkout");
  });
});

describe("workAtStake", () => {
  it("drops disposable build output and keeps everything else", () => {
    const status = [
      " M src/a.ts",
      "?? scratch.txt",
      "!! node_modules/x/index.js",
      "!! apps/mobile/ios/Podfile.lock",
      "!! .husky/_/pre-commit",
      "!! apps/api/.env",
      "!! .claude/settings.local.json",
    ].join("\n");
    assert.deepEqual(workAtStake(status), [
      " M src/a.ts",
      "?? scratch.txt",
      "!! apps/api/.env",
      "!! .claude/settings.local.json",
    ]);
  });

  it("returns nothing for a clean worktree", () => {
    assert.deepEqual(workAtStake(""), []);
  });
});

describe("parseWorktrees", () => {
  it("reads path, branch and lock state, marking the first entry main", () => {
    const porcelain = [
      "worktree /repo",
      "HEAD 111",
      "branch refs/heads/main",
      "",
      "worktree /repo-65",
      "HEAD 222",
      "branch refs/heads/chore/65-mobile-release",
      "locked",
      "",
      "worktree /repo-detached",
      "HEAD 333",
      "detached",
      "",
    ].join("\n");
    assert.deepEqual(parseWorktrees(porcelain), [
      { path: "/repo", branch: "main", locked: false, main: true },
      {
        path: "/repo-65",
        branch: "chore/65-mobile-release",
        locked: true,
        main: false,
      },
      { path: "/repo-detached", branch: null, locked: false, main: false },
    ]);
  });
});
