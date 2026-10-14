---
name: cross-review
description: Review a PR (or a stack) with the opposite engine — Codex reviews Claude's work, Claude reviews Codex's — then adjudicate every finding with evidence and re-review the changed head.
disable-model-invocation: true
argument-hint: "<PR numbers> [--reviewer codex|claude] [--rounds N] [--publish]"
---

# Cross-review

You are the **coordinator**. Another engine is the **reviewer**: it starts fresh, reads only, and never edits. You **adjudicate** what it reports. The maintainer decides merges and accepts risks. A review result is only as good as its **pinned** head: any later head makes it **stale**.

Arguments:

- **PR numbers** (required): one PR or every PR of a stack.
- **`--reviewer`**: defaults to the engine that did _not_ implement the change.
- **`--rounds N`**: fresh discovery rounds, default 1. Repeating a blind review is not reproducing a bug, so use more only for a deliberate high-risk change. Follow-up rounds (step 4) are separate.
- **`--publish`**: posts the report on the PR. Without it, the report stays a local draft.

## 1. Pin the target

For each PR, read `gh pr view <n> --json baseRefOid,headRefOid,body,closingIssuesReferences`, `git fetch`, and check that `git diff <base>...<head>` is non-empty. A stack is pinned PR by PR, each against its own base. Its top PR's head is the **integration candidate**: the stack's contract evidence is established there.

Find the spec: the closing issue's validation contract (see the handoff template in `docs/agents/workflow.md`), else the PR body. Save it, and every input it links, as local files: the reviewer can't fetch.

Make a task folder outside the repo: `${TMPDIR:-/tmp}/kavtsya-review/<pr>-<head7>/`. Write `manifest.md` there with the PR, base and head SHAs, integration candidate (stacks only), spec path, edit owner, reviewer, owned resources, and `transport_relays: 0`.

**Done when** every PR has a pinned base and head, a non-empty diff, and a spec whose inputs are all local files.

## 2. Dispatch the reviewer

Fill in the reviewer prompt below and run the reviewer's command in the background, with stdin closed. Give it a **20-minute deadline**. macOS has no `timeout`, so you enforce the deadline yourself: stop a run that is still going at the deadline, and record it as INCOMPLETE (deadline).

- **Codex:**

  ```sh
  codex -a never exec --ignore-user-config -s read-only -C <worktree> --json \
    -o <task>/review-r<N>.md "<prompt>" < /dev/null \
    > <task>/review-r<N>.jsonl 2> <task>/review-r<N>.err
  ```

  Don't add `--ephemeral`: it broke the skill's parallel subagents.

- **Claude:**

  ```sh
  claude -p --plugin-dir <repo>/.agents/plugins/mattpocock-skills \
    --tools Read,Glob,Grep,Skill,Agent --permission-mode dontAsk \
    --permission-prompts none "<prompt>" < /dev/null > <task>/review-r<N>.md
  ```

  This route has loaded the skill but has not yet completed a full review (2026-10-14). Treat its first runs as unverified.

Reviewer prompt, for a discovery round:

> Begin your report with the line `Reviewed <base>...<head>`. Use the `mattpocock-skills:code-review` skill (Codex: `$mattpocock-skills:code-review`). Fixed point: base `<base>`, head `<head>` (`git diff <base>...<head>`). Spec: `<spec file>`. Standards: `CODING_STANDARDS.md` and the files it points to. Constraints: read-only; do not run tests, touch databases, edit files, fetch, or publish. Report both axes. For every finding give a verdict: CONFIRMED(source) only if the quoted code proves it, otherwise PLAUSIBLE, with the evidence that would confirm it. If you could not complete the review, say INCOMPLETE and why.

For a follow-up round, add:

> Previous findings are in `<task>/review-r<N-1>.md`. First review the full diff fresh. Then mark each previous finding FIXED, NOT FIXED or REGRESSED, and report any new finding.

**Done when** the command has exited 0 before the deadline, and its report starts with `Reviewed <base>...<head>` matching the pin and covers both axes or says INCOMPLETE. Anything else is **INCOMPLETE**: record the reason, never "no findings".

## 3. Adjudicate every finding

Check each finding yourself at the pinned head. A claimed regression is checked on the base too. Record one of:

- **CONFIRMED(source)**: the quoted code proves it.
- **CONFIRMED(runtime)**: a test or probe reproduces it. Use your own test database and ports (`docs/agents/workflow.md`).
- **PLAUSIBLE**: not reproduced; say what would confirm it.
- **DROPPED**: disproven; say how.

Agreement between reviewers is not evidence, and votes don't decide.

Then give every assertion of the spec's validation contract a disposition: the evidence that establishes it at the pinned head (for a stack, the integration candidate), usually a test that ran, or an explicit gap. A clean review or a green `pnpm verify` doesn't establish an assertion on its own.

**Done when** every finding has a verdict with evidence, and every contract assertion has evidence or a recorded gap.

## 4. Fix, then re-review

The edit owner fixes the confirmed findings and runs `pnpm verify`. When you are the edit owner, check that each new test goes red once the behaviour it guards is broken. A pushed fix changes the head, which makes the round stale: pin the new head and go back to step 2 with the follow-up prompt.

**Converged** is a follow-up round with no new CONFIRMED finding. After 3 follow-up rounds without converging, stop and escalate to the maintainer as **not converging**: fixes that keep producing findings point to the design or the contract, not to another round.

**Done when** the final head has converged with no open CONFIRMED finding, or you have escalated.

## 5. Report

Write one report to `<task>/report.md`:

- the pinned base and final head;
- a table of findings: finding, axis, reviewer verdict, adjudication with evidence, disposition;
- a table of contract assertions: assertion, evidence or gap;
- the runtime evidence: `pnpm verify` exit code and counts, and any mutation checks;
- measures: messages relayed through the maintainer, heads that went stale, findings by source and verdict, and tooling incidents.

The review is **not ready** while it has any open CONFIRMED finding, any INCOMPLETE round, a final head without a converged follow-up, any contract assertion with an unaccepted gap, or any PLAUSIBLE authorization or data-integrity finding. With `--publish`, post the report with `gh pr comment <n> --body-file`. Merging and risk acceptance stay with the maintainer.

**Done when** the report exists and, with `--publish`, is posted.
