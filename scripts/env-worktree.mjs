// Provisions a worktree's .env: a copy of the main checkout's, moved to a
// Postgres port of its own so each checkout runs its own `db` service.
// Policy: docs/agents/workflow.md, "Working concurrently".
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import { parseEnv } from "node:util";
import { parseWorktrees } from "./git-prune-merged.mjs";

const PORTS = { first: 5433, last: 5532 };
const DB_KEYS = ["DB_PORT", "DATABASE_URL", "TEST_DATABASE_URL"];
/** What `.env.example` points the database URLs at, before the port moves. */
const DEFAULT_URLS = {
  DATABASE_URL: "postgres://kavtsya:kavtsya@localhost:5432/kavtsya",
  TEST_DATABASE_URL: "postgres://kavtsya:kavtsya@localhost:5432/kavtsya_test",
};

/**
 * `envText` pointed at this checkout's own Postgres on `port`: every line that
 * sets DB_PORT or a database URL gives way to one plain line, and each URL
 * keeps its credentials and database name but targets localhost:`port`.
 */
export function withDbPort(envText, port) {
  const values = parseEnv(envText);
  const kept = envText
    .split("\n")
    .filter(
      (line) =>
        !DB_KEYS.some((key) =>
          new RegExp(`^\\s*(export\\s+)?${key}\\s*=`).test(line),
        ),
    )
    .join("\n")
    .replace(/\n*$/, "\n");
  const urls = Object.entries(DEFAULT_URLS).map(([key, fallback]) => {
    const url = new URL(values[key] ?? fallback);
    url.hostname = "localhost";
    url.port = String(port);
    return `${key}=${url.href}`;
  });
  return `${kept === "\n" ? "" : kept}DB_PORT=${port}\n${urls.join("\n")}\n`;
}

function bindable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

/** The first port no checkout's .env claims and nothing listens on, or null. */
async function freePort(worktrees) {
  const claimed = new Set(
    worktrees
      .map((tree) => path.join(tree.path, ".env"))
      .filter((file) => existsSync(file))
      .map((file) => Number(parseEnv(readFileSync(file, "utf8")).DB_PORT)),
  );
  for (let port = PORTS.first; port <= PORTS.last; port++) {
    if (
      !claimed.has(port) &&
      (await bindable(port, "0.0.0.0")) &&
      (await bindable(port, "127.0.0.1"))
    ) {
      return port;
    }
  }
  return null;
}

/** Runs `fn` while holding `lockDir`, so concurrent runs can't claim one port. */
async function withLock(lockDir, fn) {
  for (let waited = 0; ; waited += 100) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (waited >= 10_000) {
        console.error(
          `Another env:worktree run holds ${lockDir}. If none is running, remove that directory and retry.`,
        );
        process.exitCode = 1;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  try {
    await fn();
  } finally {
    rmdirSync(lockDir);
  }
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

async function main() {
  const target = path.join(git("rev-parse", "--show-toplevel"), ".env");
  const mainCheckout = parseWorktrees(git("worktree", "list", "--porcelain"))[0]
    .path;
  const source = path.join(mainCheckout, ".env");

  if (existsSync(target)) {
    const shared =
      target !== source && !parseEnv(readFileSync(target, "utf8")).DB_PORT;
    console.log(
      shared
        ? `${target} already exists but sets no DB_PORT, so this checkout's Postgres collides with the main checkout's on 5432. Delete it and re-run to give it a port of its own.`
        : `${target} already exists; left it unchanged.`,
    );
    return;
  }
  if (!existsSync(source)) {
    console.error(
      `The main checkout (${mainCheckout}) has no .env to copy. Create it from .env.example first (README, Setup).`,
    );
    process.exitCode = 1;
    return;
  }
  const lockDir = path.join(
    git("rev-parse", "--path-format=absolute", "--git-common-dir"),
    "env-worktree.lock",
  );
  await withLock(lockDir, async () => {
    // Listed inside the lock, so a run that just finished counts its claim.
    const worktrees = parseWorktrees(git("worktree", "list", "--porcelain"));
    const port = await freePort(worktrees);
    if (port === null) {
      console.error(
        `No free port in ${PORTS.first}-${PORTS.last} for this checkout's Postgres.`,
      );
      process.exitCode = 1;
      return;
    }
    writeFileSync(target, withDbPort(readFileSync(source, "utf8"), port), {
      flag: "wx",
    });
    console.log(`Wrote ${target} from ${source} with DB_PORT=${port}.`);
  });
}

if (import.meta.main) await main();
