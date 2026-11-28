import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { withDbPort } from "./env-worktree.mjs";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "env-worktree.mjs",
);

/** The parent environment minus GIT_*, so a hook's GIT_DIR can't aim git at this repo. */
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

const MAIN_ENV = `# local dev
DATABASE_URL=postgres://kavtsya:kavtsya@localhost:5432/kavtsya
BETTER_AUTH_SECRET=main-secret-at-least-32-characters-long
TEST_DATABASE_URL=postgres://kavtsya:kavtsya@localhost:5432/kavtsya_test
`;

/** A main checkout with one commit, removed after the test; returns its path. */
function mainCheckout(t) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "env-worktree-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const main = path.join(dir, "main");
  execFileSync("git", ["init", "-q", "-b", "main", main], { env: ENV });
  execFileSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t"].concat([
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "init",
    ]),
    { cwd: main, env: ENV },
  );
  return main;
}

function addWorktree(main, name) {
  const tree = path.join(path.dirname(main), name);
  execFileSync("git", ["worktree", "add", "-q", "-b", name, tree], {
    cwd: main,
    env: ENV,
  });
  return tree;
}

function run(cwd) {
  return spawnSync("node", [script], { cwd, env: ENV, encoding: "utf8" });
}

function runAsync(cwd) {
  return new Promise((resolve) => {
    const child = spawn("node", [script], { cwd, env: ENV });
    child.on("close", resolve);
  });
}

const env = (text, key) => text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1];
const dbPort = (tree) =>
  env(readFileSync(path.join(tree, ".env"), "utf8"), "DB_PORT");

test("copies the main checkout's .env onto a free port from 5433", (t) => {
  const main = mainCheckout(t);
  writeFileSync(path.join(main, ".env"), MAIN_ENV);
  const tree = addWorktree(main, "task");

  const result = run(tree);

  assert.equal(result.status, 0, result.stderr);
  const written = readFileSync(path.join(tree, ".env"), "utf8");
  const port = Number(env(written, "DB_PORT"));
  assert.ok(port >= 5433, `DB_PORT=${port}`);
  assert.equal(
    env(written, "DATABASE_URL"),
    `postgres://kavtsya:kavtsya@localhost:${port}/kavtsya`,
  );
  assert.equal(
    env(written, "TEST_DATABASE_URL"),
    `postgres://kavtsya:kavtsya@localhost:${port}/kavtsya_test`,
  );
  assert.equal(
    env(written, "BETTER_AUTH_SECRET"),
    "main-secret-at-least-32-characters-long",
  );
  assert.doesNotMatch(result.stdout + result.stderr, /main-secret/);
  assert.equal(readFileSync(path.join(main, ".env"), "utf8"), MAIN_ENV);
});

test("leaves an existing .env unchanged and says so", (t) => {
  const main = mainCheckout(t);
  writeFileSync(path.join(main, ".env"), MAIN_ENV);
  const tree = addWorktree(main, "task");
  assert.equal(run(tree).status, 0);
  const first = readFileSync(path.join(tree, ".env"), "utf8");

  const again = run(tree);

  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already exists; left it unchanged/);
  assert.equal(readFileSync(path.join(tree, ".env"), "utf8"), first);
});

test("warns when an existing worktree .env sets no DB_PORT", (t) => {
  const main = mainCheckout(t);
  writeFileSync(path.join(main, ".env"), MAIN_ENV);
  const tree = addWorktree(main, "task");
  writeFileSync(path.join(tree, ".env"), MAIN_ENV);

  const result = run(tree);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sets no DB_PORT.*Delete it and re-run/);
  assert.equal(readFileSync(path.join(tree, ".env"), "utf8"), MAIN_ENV);
});

test("fails and writes nothing when the main checkout has no .env", (t) => {
  const main = mainCheckout(t);
  const tree = addWorktree(main, "task");

  const result = run(tree);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /no \.env to copy/);
  assert.equal(existsSync(path.join(tree, ".env")), false);
});

test("skips a port another worktree's .env claims while its Postgres is down", (t) => {
  const main = mainCheckout(t);
  writeFileSync(path.join(main, ".env"), MAIN_ENV);
  const first = addWorktree(main, "first");
  const second = addWorktree(main, "second");

  assert.equal(run(first).status, 0);
  assert.equal(run(second).status, 0);

  assert.notEqual(dbPort(second), dbPort(first));
});

test("gives worktrees provisioned at the same moment different ports", async (t) => {
  const main = mainCheckout(t);
  writeFileSync(path.join(main, ".env"), MAIN_ENV);
  const trees = ["a", "b", "c"].map((name) => addWorktree(main, name));

  const codes = await Promise.all(trees.map(runAsync));

  assert.deepEqual(codes, [0, 0, 0]);
  assert.equal(new Set(trees.map(dbPort)).size, 3);
});

test("adds the local database URLs a copied .env lacks", () => {
  assert.equal(
    withDbPort("PORT=3000", 5440),
    `PORT=3000
DB_PORT=5440
DATABASE_URL=postgres://kavtsya:kavtsya@localhost:5440/kavtsya
TEST_DATABASE_URL=postgres://kavtsya:kavtsya@localhost:5440/kavtsya_test
`,
  );
});

test("replaces quoted, exported, repeated and remote database lines", () => {
  const main = `PORT=3000
DB_PORT=5432
export DATABASE_URL="postgres://kavtsya:kavtsya@localhost:5432/old"
DATABASE_URL='postgres://kavtsya:kavtsya@localhost:5432/kavtsya'
TEST_DATABASE_URL=postgres://u:p@db.example.com:6543/app_test
`;
  assert.equal(
    withDbPort(main, 5440),
    `PORT=3000
DB_PORT=5440
DATABASE_URL=postgres://kavtsya:kavtsya@localhost:5440/kavtsya
TEST_DATABASE_URL=postgres://u:p@localhost:5440/app_test
`,
  );
});
