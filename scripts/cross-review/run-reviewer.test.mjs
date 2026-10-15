import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  engineCommand,
  renderPrompt,
  runReviewer,
  validateReport,
} from "./run-reviewer.mjs";

// Hermetic git: fixtures must not inherit the machine's signing, hooks or templates.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

const BASE = "a".repeat(40);
const GOOD_REPORT = (base, head) =>
  `Reviewed ${base}...${head}\n\n## Standards\nNo findings.\n\n## Spec\nNo findings.\n`;

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** A throwaway repo with one commit; returns its path and HEAD. */
function makeWorktree() {
  const dir = mkdtempSync(path.join(tmpdir(), "cross-review-wt-"));
  git(dir, "init", "-q");
  writeFileSync(path.join(dir, "file.txt"), "original\n");
  git(dir, "add", ".");
  git(
    dir,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-qm",
    "init",
  );
  return { dir, head: git(dir, "rev-parse", "HEAD") };
}

/** Runs `script` as a fake reviewer; REPORT, BASE and HEAD are in its env. */
async function run(script, overrides = {}) {
  const { dir, head } = makeWorktree();
  const task = mkdtempSync(path.join(tmpdir(), "cross-review-task-"));
  const prefix = path.join(task, "review-r1-fake");
  const options = {
    argv: [process.execPath, "-e", script],
    env: { ...process.env, REPORT: `${prefix}.md`, BASE, HEAD: head },
    worktree: dir,
    base: BASE,
    head,
    prefix,
    reportSource: "file",
    deadlineMs: 5000,
    graceMs: 300,
    ...overrides,
  };
  const outcome = await runReviewer(options);
  return { outcome, dir, head, prefix };
}

/** Fake-reviewer source for a valid report whose header names `headExpr`. */
const reportExpr = (headExpr = "process.env.HEAD") =>
  `"Reviewed " + process.env.BASE + "..." + ${headExpr} + "\\n\\n## Standards\\nNo findings.\\n\\n## Spec\\nNo findings.\\n"`;
const writeGoodReport = `require("fs").writeFileSync(process.env.REPORT, ${reportExpr()})`;

/** True while `pid` exists; a killed orphan gets a moment to be reaped. */
async function alive(pid) {
  for (let i = 0; i < 40; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return true;
}

describe("runReviewer", () => {
  it("records COMPLETE for a valid report and writes the outcome file", async () => {
    const { outcome, prefix, head } = await run(writeGoodReport);
    assert.equal(outcome.outcome, "COMPLETE");
    assert.equal(outcome.exitCode, 0);
    const saved = JSON.parse(readFileSync(`${prefix}.outcome.json`, "utf8"));
    assert.equal(saved.outcome, "COMPLETE");
    assert.equal(saved.head, head);
  });

  it("stops a reviewer at the deadline and records INCOMPLETE", async () => {
    const started = Date.now();
    const { outcome } = await run("setInterval(() => {}, 1000)", {
      deadlineMs: 500,
    });
    assert.equal(outcome.outcome, "INCOMPLETE");
    assert.match(outcome.reason, /deadline/);
    assert.ok(Date.now() - started < 3000, "deadline was not enforced");
  });

  it("kills a reviewer that ignores SIGTERM after the grace period", async () => {
    const { outcome } = await run(
      'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)',
      { deadlineMs: 300, graceMs: 300 },
    );
    assert.equal(outcome.outcome, "INCOMPLETE");
    assert.equal(outcome.signal, "SIGKILL");
  });

  it("leaves no descendant alive after the reviewer exits", async () => {
    const { outcome, prefix } = await run(
      `const { spawn } = require("child_process");
       const child = spawn(process.execPath, ["-e", 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: "ignore" });
       child.unref();
       require("fs").writeFileSync(process.env.REPORT + ".pid", String(child.pid));
       ${writeGoodReport}`,
    );
    const pid = Number(readFileSync(`${prefix}.md.pid`, "utf8"));
    assert.equal(await alive(pid), false, `descendant ${pid} survived`);
    assert.equal(outcome.outcome, "COMPLETE");
  });

  it("leaves no descendant alive after a deadline kill", async () => {
    const { prefix } = await run(
      `const { spawn } = require("child_process");
       const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
       require("fs").writeFileSync(process.env.REPORT + ".pid", String(child.pid));
       setInterval(() => {}, 1000)`,
      { deadlineMs: 500 },
    );
    const pid = Number(readFileSync(`${prefix}.md.pid`, "utf8"));
    assert.equal(await alive(pid), false, `descendant ${pid} survived`);
  });

  it("records a crash with its exit code and captures stdout and stderr", async () => {
    const { outcome, prefix } = await run(
      'console.log("out-line"); console.error("err-line"); process.exit(3)',
    );
    assert.equal(outcome.outcome, "INCOMPLETE");
    assert.equal(outcome.exitCode, 3);
    assert.match(outcome.reason, /exit 3/);
    assert.match(readFileSync(`${prefix}.stdout`, "utf8"), /out-line/);
    assert.match(readFileSync(`${prefix}.stderr`, "utf8"), /err-line/);
  });

  it("rejects a run that exits 0 without a report", async () => {
    const { outcome } = await run("");
    assert.equal(outcome.outcome, "INCOMPLETE");
    assert.match(outcome.reason, /no report/);
  });

  it("rejects a report for another head", async () => {
    const { outcome } = await run(
      `require("fs").writeFileSync(process.env.REPORT, ${reportExpr(`"${"b".repeat(40)}"`)})`,
    );
    assert.equal(outcome.outcome, "INCOMPLETE");
    assert.match(outcome.reason, /header/);
  });

  it("takes the report from stdout when asked", async () => {
    const { outcome, prefix } = await run(
      `process.stdout.write(${reportExpr()})`,
      { reportSource: "stdout" },
    );
    assert.equal(outcome.outcome, "COMPLETE");
    assert.match(readFileSync(`${prefix}.md`, "utf8"), /^Reviewed /);
  });

  it("takes the report from Claude's JSON result and rejects an error result", async () => {
    const json = (result, isError) =>
      `process.stdout.write(JSON.stringify({ is_error: ${isError}, subtype: "${isError ? "error_max_turns" : "success"}", result: ${result} }))`;
    const ok = await run(json(reportExpr(), false), {
      reportSource: "claude-json",
    });
    assert.equal(ok.outcome.outcome, "COMPLETE");
    const failed = await run(json('""', true), { reportSource: "claude-json" });
    assert.equal(failed.outcome.outcome, "INCOMPLETE");
    assert.match(failed.outcome.reason, /error_max_turns/);
  });

  it("records engine and round in the outcome", async () => {
    const { outcome } = await run(writeGoodReport, {
      engine: "codex",
      round: "2",
    });
    assert.equal(outcome.engine, "codex");
    assert.equal(outcome.round, "2");
  });

  it("records INCOMPLETE when the result cannot be checked", async () => {
    const { outcome, prefix } = await run(
      `require("fs").rmSync(".git", { recursive: true }); ${writeGoodReport}`,
    );
    assert.equal(outcome.outcome, "INCOMPLETE");
    assert.match(outcome.reason, /could not check/);
    assert.ok(existsSync(`${prefix}.outcome.json`));
  });

  it("rejects Claude JSON that is not an object", async () => {
    const { outcome } = await run('process.stdout.write("null")', {
      reportSource: "claude-json",
    });
    assert.equal(outcome.outcome, "INCOMPLETE");
    assert.match(outcome.reason, /not a JSON object/);
  });

  it("rejects a reviewer that changes the worktree", async () => {
    const { outcome } = await run(
      `require("fs").writeFileSync("file.txt", "edited\\n"); ${writeGoodReport}`,
    );
    assert.equal(outcome.outcome, "INCOMPLETE");
    assert.match(outcome.reason, /worktree changed/);
  });

  it("rejects a reviewer that adds an untracked file", async () => {
    const { outcome } = await run(
      `require("fs").writeFileSync("new.txt", "x"); ${writeGoodReport}`,
    );
    assert.match(outcome.reason, /worktree changed/);
  });

  it("refuses to launch when the worktree is not at the pinned head", async () => {
    const { dir } = makeWorktree();
    const task = mkdtempSync(path.join(tmpdir(), "cross-review-task-"));
    await assert.rejects(
      runReviewer({
        argv: [process.execPath, "-e", ""],
        worktree: dir,
        base: BASE,
        head: "c".repeat(40),
        prefix: path.join(task, "review-r1-fake"),
        reportSource: "file",
        deadlineMs: 1000,
      }),
      /not at the pinned head/,
    );
  });

  it("refuses to launch on a dirty worktree", async () => {
    const { dir, head } = makeWorktree();
    writeFileSync(path.join(dir, "file.txt"), "dirty\n");
    const task = mkdtempSync(path.join(tmpdir(), "cross-review-task-"));
    await assert.rejects(
      runReviewer({
        argv: [process.execPath, "-e", ""],
        worktree: dir,
        base: BASE,
        head,
        prefix: path.join(task, "review-r1-fake"),
        reportSource: "file",
        deadlineMs: 1000,
      }),
      /not clean/,
    );
  });

  it("never overwrites the outcome of an earlier run", async () => {
    const first = await run(writeGoodReport);
    await assert.rejects(
      runReviewer({
        argv: [process.execPath, "-e", ""],
        worktree: first.dir,
        base: BASE,
        head: first.head,
        prefix: first.prefix,
        reportSource: "file",
        deadlineMs: 1000,
      }),
      /already exists/,
    );
  });
});

describe("validateReport", () => {
  const head = "d".repeat(40);
  const ok = GOOD_REPORT(BASE, head);

  it("accepts a report with the header and both axes", () => {
    assert.equal(validateReport(ok, { base: BASE, head }), null);
  });

  it("rejects an empty report", () => {
    assert.match(validateReport("  \n", { base: BASE, head }), /no report/);
  });

  it("rejects a report missing an axis", () => {
    assert.match(
      validateReport(ok.replace("## Spec", "## Other"), { base: BASE, head }),
      /## Spec/,
    );
    assert.match(
      validateReport(ok.replace("## Standards", "## Other"), {
        base: BASE,
        head,
      }),
      /## Standards/,
    );
  });

  it("rejects a report that declares itself INCOMPLETE", () => {
    const report = ok.replace(
      "\n\n## Standards",
      "\nINCOMPLETE: diff unreadable\n\n## Standards",
    );
    assert.match(
      validateReport(report, { base: BASE, head }),
      /INCOMPLETE: diff unreadable/,
    );
  });
});

describe("renderPrompt", () => {
  it("fills every placeholder", () => {
    assert.equal(
      renderPrompt("{{BASE}}...{{HEAD}} {{BASE}}", { BASE: "b", HEAD: "h" }),
      "b...h b",
    );
  });

  it("refuses an unfilled placeholder", () => {
    assert.throws(
      () => renderPrompt("{{BASE}} {{SPEC}}", { BASE: "b" }),
      /SPEC/,
    );
  });
});

describe("engineCommand", () => {
  const args = {
    worktree: "/wt",
    inputs: "/task/inputs",
    prompt: "the prompt",
    reportPath: "/task/r.md",
  };

  it("passes both engines the identical prompt", () => {
    const codex = engineCommand("codex", args);
    const claude = engineCommand("claude", args);
    assert.equal(codex.argv.at(-1), "the prompt");
    assert.equal(claude.argv.at(-1), "the prompt");
  });

  it("launches Codex read-only with config ignored and the report in a file", () => {
    const { argv, reportSource } = engineCommand("codex", args);
    assert.deepEqual(argv.slice(0, 7), [
      "codex",
      "-a",
      "never",
      "exec",
      "--ignore-user-config",
      "-s",
      "read-only",
    ]);
    assert.equal(argv[argv.indexOf("-o") + 1], "/task/r.md");
    assert.equal(reportSource, "file");
  });

  it("launches Claude restricted to read tools, without MCP, confined to the worktree and inputs", () => {
    const { argv, reportSource } = engineCommand("claude", args);
    const value = (flag) => argv[argv.indexOf(flag) + 1];
    assert.ok(argv.includes("--restricted"));
    assert.ok(argv.includes("--strict-mcp-config"));
    assert.equal(value("--tools"), "Read,Grep,Glob,Agent");
    assert.equal(value("--permission-prompts"), "none");
    assert.equal(value("--add-dir"), "/task/inputs");
    assert.equal(reportSource, "claude-json");
  });

  it("rejects an unknown engine", () => {
    assert.throws(() => engineCommand("gemini", args), /engine/);
  });
});

describe("prompt template", () => {
  it("has only the placeholders the CLI fills", () => {
    const dir = path.resolve(
      import.meta.dirname,
      "../../.agents/skills/cross-review",
    );
    for (const file of ["reviewer-prompt.md", "reviewer-follow-up.md"]) {
      assert.ok(existsSync(path.join(dir, file)), file);
      const text = readFileSync(path.join(dir, file), "utf8");
      const names = new Set(
        [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
      );
      for (const name of names) {
        assert.ok(
          ["BASE", "HEAD", "INPUTS", "PREVIOUS"].includes(name),
          `${file} uses unknown placeholder ${name}`,
        );
      }
    }
  });
});
