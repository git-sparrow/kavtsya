import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPrune,
  isProvisionedEnv,
  planPrune,
  workAtStake,
} from "./git-prune-merged.mjs";
import { withDbPort } from "./env-worktree.mjs";
import { parseWorktrees } from "./worktrees.mjs";

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
      "!! apps/web/src/styles/tokens.css",
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

  it("drops only the root .env, and only when it is provisioned", () => {
    const status = "!! .env\n!! apps/api/.env";
    assert.deepEqual(workAtStake(status), ["!! .env", "!! apps/api/.env"]);
    assert.deepEqual(workAtStake(status, { provisionedEnv: true }), [
      "!! apps/api/.env",
    ]);
  });
});

describe("isProvisionedEnv", () => {
  const MAIN_ENV = "SECRET=abc\nDATABASE_URL=postgres://u:p@localhost:5432/d\n";

  it("accepts exactly what env:worktree would write", () => {
    assert.ok(isProvisionedEnv(withDbPort(MAIN_ENV, 5440), MAIN_ENV));
  });

  it("rejects an .env edited by hand", () => {
    const edited = `${withDbPort(MAIN_ENV, 5440)}MY_TOKEN=keep-me\n`;
    assert.equal(isProvisionedEnv(edited, MAIN_ENV), false);
  });

  it("rejects an .env that sets no DB_PORT", () => {
    assert.equal(isProvisionedEnv(MAIN_ENV, MAIN_ENV), false);
  });

  it("rejects an .env the main one has since moved on from", () => {
    const worktreeEnv = withDbPort(MAIN_ENV, 5440);
    assert.equal(isProvisionedEnv(worktreeEnv, `${MAIN_ENV}NEW=1\n`), false);
  });
});

describe("applyPrune", () => {
  function run(decisions, composeDown) {
    const calls = [];
    const kept = applyPrune(decisions, {
      composeDown: (dir) => {
        calls.push(`down ${dir}`);
        composeDown(dir);
      },
      removeWorktree: (dir) => calls.push(`remove ${dir}`),
      deleteBranch: (name) => calls.push(`branch ${name}`),
      log: (line) => calls.push(`log ${line}`),
    });
    return { kept, calls };
  }

  it("takes the Postgres down before removing the worktree and branch", () => {
    const worktree = tree("fix/a");
    const { kept, calls } = run([{ branch: "fix/a", worktree }], () => {});
    assert.deepEqual(kept, []);
    assert.deepEqual(calls, [
      `down ${worktree.path}`,
      `remove ${worktree.path}`,
      "branch fix/a",
      "log pruned fix/a",
    ]);
  });

  it("keeps the worktree and branch, with the reason, when compose fails", () => {
    const worktree = tree("fix/a");
    const { kept, calls } = run([{ branch: "fix/a", worktree }], () => {
      throw new Error("Cannot connect to the Docker daemon");
    });
    assert.equal(kept.length, 1);
    assert.match(
      kept[0].reason,
      /docker compose down -v failed.*Docker daemon/,
    );
    assert.deepEqual(
      calls.filter((call) => /^(remove|branch) /.test(call)),
      [],
    );
  });

  it("needs no Docker for a branch without a worktree", () => {
    const { kept, calls } = run([{ branch: "fix/a", worktree: null }], () => {
      throw new Error("docker must not run");
    });
    assert.deepEqual(kept, []);
    assert.deepEqual(calls, ["branch fix/a", "log pruned fix/a"]);
  });

  it("keeps going after one worktree fails", () => {
    const failing = tree("fix/a");
    const fine = tree("fix/b");
    const { kept, calls } = run(
      [
        { branch: "fix/a", worktree: failing },
        { branch: "fix/b", worktree: fine },
      ],
      (dir) => {
        if (dir === failing.path) throw new Error("down");
      },
    );
    assert.deepEqual(
      kept.map((entry) => entry.branch),
      ["fix/a"],
    );
    assert.ok(calls.includes("branch fix/b"));
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
