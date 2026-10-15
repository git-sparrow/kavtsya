#!/usr/bin/env node
// Runs one cross-review reviewer with the guarantees the cross-review skill
// relies on: a pinned clean worktree, the canonical prompt, an enforced deadline,
// cleanup of the reviewer's process group, and a validated report. Every run
// ends in an outcome file; anything short of a valid report is INCOMPLETE.
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const SKILL_DIR = path.resolve(
  import.meta.dirname,
  "../../.agents/skills/cross-review",
);

export function renderPrompt(template, vars) {
  const text = template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
    name in vars ? vars[name] : match,
  );
  const unfilled = text.match(/\{\{\w+\}\}/);
  if (unfilled)
    throw new Error(`Prompt placeholder not filled: ${unfilled[0]}`);
  return text;
}

/**
 * The launch command for each engine. Both get the same prompt; only the
 * provider-specific read-only restrictions differ (pilots in the skill).
 * Claude's file tools reach only the worktree and `inputs`, so it cannot read
 * another reviewer's report in the task folder.
 */
export function engineCommand(
  engine,
  { worktree, inputs, prompt, reportPath },
) {
  if (engine === "codex") {
    return {
      argv: [
        "codex",
        "-a",
        "never",
        "exec",
        "--ignore-user-config",
        "-s",
        "read-only",
        "-C",
        worktree,
        "--json",
        "-o",
        reportPath,
        prompt,
      ],
      reportSource: "file",
    };
  }
  if (engine === "claude") {
    return {
      argv: [
        "claude",
        "-p",
        "--restricted",
        "--tools",
        "Read,Grep,Glob,Agent",
        "--strict-mcp-config",
        "--permission-mode",
        "dontAsk",
        "--permission-prompts",
        "none",
        "--no-session-persistence",
        "--add-dir",
        inputs,
        "--output-format",
        "json",
        prompt,
      ],
      reportSource: "claude-json",
    };
  }
  throw new Error(`Unknown engine "${engine}": use claude or codex`);
}

/** Returns why the report is unusable, or null when it is a complete review. */
export function validateReport(text, { base, head }) {
  if (!text?.trim()) return "no report";
  const header = text.trim().split("\n", 1)[0].trim();
  const expected = `Reviewed ${base}...${head}`;
  if (header !== expected) {
    return `report header "${header}" does not match "${expected}"`;
  }
  const declared = text.match(/^INCOMPLETE\b.*$/m);
  if (declared) return `reviewer reported ${declared[0].trim()}`;
  for (const axis of ["## Standards", "## Spec"]) {
    if (!new RegExp(`^${axis}\\b`, "m").test(text)) {
      return `report has no ${axis} section`;
    }
  }
  return null;
}

function worktreeState(worktree) {
  const git = (...args) =>
    execFileSync("git", ["-C", worktree, ...args], { encoding: "utf8" });
  return {
    head: git("rev-parse", "HEAD").trim(),
    status: git("status", "--porcelain", "--untracked-files=all"),
  };
}

function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group is already gone.
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForGroupExit(pid, ms) {
  const until = Date.now() + ms;
  while (groupAlive(pid) && Date.now() < until) await sleep(25);
  return !groupAlive(pid);
}

/** TERM the whole process group, then KILL whatever outlives the grace period. */
async function stopGroup(pid, graceMs) {
  signalGroup(pid, "SIGTERM");
  if (await waitForGroupExit(pid, graceMs)) return;
  signalGroup(pid, "SIGKILL");
  await waitForGroupExit(pid, graceMs);
}

function readReport(prefix, reportSource) {
  const reportPath = `${prefix}.md`;
  if (reportSource === "file") {
    return existsSync(reportPath)
      ? { text: readFileSync(reportPath, "utf8") }
      : {};
  }
  const stdout = readFileSync(`${prefix}.stdout`, "utf8");
  let text = stdout;
  if (reportSource === "claude-json") {
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      return { error: "Claude output is not JSON" };
    }
    if (result.is_error)
      return { error: `Claude ended with ${result.subtype}` };
    text = result.result ?? "";
  }
  writeFileSync(reportPath, text);
  return { text };
}

/**
 * Runs `argv` in `worktree` and returns the outcome it also writes to
 * `<prefix>.outcome.json`. Throws, without launching, when the worktree is
 * not cleanly at `head` or this prefix already has an outcome.
 */
export async function runReviewer({
  argv,
  env = process.env,
  worktree,
  base,
  head,
  prefix,
  reportSource,
  deadlineMs,
  graceMs = 5000,
}) {
  const outcomePath = `${prefix}.outcome.json`;
  if (existsSync(outcomePath)) {
    throw new Error(`${outcomePath} already exists; start a new round`);
  }
  const before = worktreeState(worktree);
  if (before.head !== head) {
    throw new Error(
      `Worktree ${worktree} is at ${before.head}, not at the pinned head ${head}`,
    );
  }
  if (before.status) throw new Error(`Worktree ${worktree} is not clean`);

  const stdoutFd = openSync(`${prefix}.stdout`, "w");
  const stderrFd = openSync(`${prefix}.stderr`, "w");
  const started = Date.now();
  // detached: the reviewer leads a new process group, so one signal reaches
  // every descendant that did not start its own session.
  const child = spawn(argv[0], argv.slice(1), {
    cwd: worktree,
    env,
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd],
  });
  let timedOut = false;
  const exited = new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
    child.on("error", (error) => resolve({ code: null, signal: null, error }));
  });
  const timer = setTimeout(() => {
    timedOut = true;
    stopGroup(child.pid, graceMs);
  }, deadlineMs);
  const { code, signal, error } = await exited;
  clearTimeout(timer);
  if (child.pid) await stopGroup(child.pid, graceMs);
  closeSync(stdoutFd);
  closeSync(stderrFd);

  let reason = null;
  if (error) reason = `could not start ${argv[0]}: ${error.message}`;
  else if (timedOut) reason = `deadline of ${deadlineMs} ms reached`;
  else if (code !== 0) reason = signal ? `killed by ${signal}` : `exit ${code}`;
  if (!reason) {
    const after = worktreeState(worktree);
    if (after.head !== head || after.status) {
      reason = `worktree changed during the review:\n${after.status}`.trim();
    }
  }
  if (!reason) {
    const report = readReport(prefix, reportSource);
    reason = report.error ?? validateReport(report.text, { base, head });
  }

  const outcome = {
    outcome: reason ? "INCOMPLETE" : "COMPLETE",
    reason,
    base,
    head,
    exitCode: code,
    signal,
    durationMs: Date.now() - started,
    command: argv[0],
    report: `${prefix}.md`,
    stdout: `${prefix}.stdout`,
    stderr: `${prefix}.stderr`,
  };
  writeFileSync(outcomePath, `${JSON.stringify(outcome, null, 2)}\n`, {
    flag: "wx",
  });
  return outcome;
}

const USAGE = `Usage: node scripts/cross-review/run-reviewer.mjs --engine claude|codex
  --task <dir> --round <N> --worktree <path> --base <sha> --head <sha>
  [--previous <report>] [--deadline-minutes 20]

Reviewer inputs live in <task>/inputs/ (at least spec.md and diff.patch);
--previous is copied there as previous-r<N>.md.
Writes <task>/review-r<N>-<engine>.{prompt.txt,md,stdout,stderr,outcome.json}.
Exits 0 when the review is COMPLETE, 1 when INCOMPLETE, 2 on a usage error.`;

async function main() {
  const { values } = parseArgs({
    options: {
      engine: { type: "string" },
      task: { type: "string" },
      round: { type: "string" },
      worktree: { type: "string" },
      base: { type: "string" },
      head: { type: "string" },
      previous: { type: "string" },
      "deadline-minutes": { type: "string", default: "20" },
    },
  });
  for (const name of ["engine", "task", "round", "worktree", "base", "head"]) {
    if (!values[name]) throw new UsageError(`--${name} is required`);
  }
  const task = path.resolve(values.task);
  const worktree = path.resolve(values.worktree);
  const inputs = path.join(task, "inputs");
  for (const input of ["spec.md", "diff.patch"]) {
    if (!existsSync(path.join(inputs, input))) {
      throw new UsageError(`${path.join(inputs, input)} is missing`);
    }
  }
  const vars = { BASE: values.base, HEAD: values.head, INPUTS: inputs };
  let prompt = renderPrompt(
    readFileSync(path.join(SKILL_DIR, "reviewer-prompt.md"), "utf8"),
    vars,
  );
  if (values.previous) {
    // Copied into inputs: a restricted reviewer reads nothing else there.
    const previous = path.join(inputs, `previous-r${values.round}.md`);
    if (!existsSync(previous)) {
      copyFileSync(path.resolve(values.previous), previous);
    }
    prompt += `\n${renderPrompt(
      readFileSync(path.join(SKILL_DIR, "reviewer-follow-up.md"), "utf8"),
      { ...vars, PREVIOUS: previous },
    )}`;
  }
  const prefix = path.join(task, `review-r${values.round}-${values.engine}`);
  const { argv, reportSource } = engineCommand(values.engine, {
    worktree,
    inputs,
    prompt,
    reportPath: `${prefix}.md`,
  });
  writeFileSync(`${prefix}.prompt.txt`, prompt, { flag: "wx" });
  const outcome = await runReviewer({
    argv,
    worktree,
    base: values.base,
    head: values.head,
    prefix,
    reportSource,
    deadlineMs: Number(values["deadline-minutes"]) * 60_000,
  });
  console.log(
    `${values.engine} r${values.round}: ${outcome.outcome}${outcome.reason ? ` (${outcome.reason})` : ""}\n${prefix}.outcome.json`,
  );
  return outcome.outcome === "COMPLETE" ? 0 : 1;
}

class UsageError extends Error {}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message);
      if (error instanceof UsageError) console.error(USAGE);
      process.exit(2);
    },
  );
}
