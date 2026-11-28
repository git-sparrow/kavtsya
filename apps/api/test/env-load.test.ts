import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDotEnv } from "../src/env";

const KEY = "KAVTSYA_ENV_LOAD_TEST";

describe("loadDotEnv", () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "load-dot-env-")));
    delete process.env[KEY];
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env[KEY];
  });

  const dir = (...parts: string[]) => {
    const path = join(root, ...parts);
    mkdirSync(path, { recursive: true });
    return path;
  };

  it("loads the .env at the root of the enclosing checkout", () => {
    const checkout = dir("main");
    writeFileSync(join(checkout, ".git"), "gitdir: x\n");
    writeFileSync(join(checkout, ".env"), `${KEY}=own\n`);
    loadDotEnv(dir("main", "apps", "api"));
    expect(process.env[KEY]).toBe("own");
  });

  it("refuses the main checkout's .env from a nested worktree without one", () => {
    const main = dir("main");
    mkdirSync(join(main, ".git"));
    writeFileSync(join(main, ".env"), `${KEY}=main\n`);
    const worktree = dir("main", ".claude", "worktrees", "x");
    writeFileSync(join(worktree, ".git"), "gitdir: y\n");

    expect(() =>
      loadDotEnv(join(dir("main", ".claude", "worktrees", "x", "apps", "api"))),
    ).toThrow(/pnpm env:worktree/);
    expect(process.env[KEY]).toBeUndefined();
  });

  it("loads a nested worktree's own .env", () => {
    const main = dir("main");
    mkdirSync(join(main, ".git"));
    writeFileSync(join(main, ".env"), `${KEY}=main\n`);
    const worktree = dir("main", ".claude", "worktrees", "x");
    writeFileSync(join(worktree, ".git"), "gitdir: y\n");
    writeFileSync(join(worktree, ".env"), `${KEY}=own\n`);
    loadDotEnv(dir("main", ".claude", "worktrees", "x", "apps", "api"));
    expect(process.env[KEY]).toBe("own");
  });

  it("still loads a .env where no git checkout encloses the directory", () => {
    writeFileSync(join(root, ".env"), `${KEY}=plain\n`);
    loadDotEnv(dir("app"));
    expect(process.env[KEY]).toBe("plain");
  });
});
