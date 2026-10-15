---
name: cross-review
description: Read-only reviewers from the other engine (or both) review a PR or stack; you adjudicate every finding, fix, and re-review each new head.
disable-model-invocation: true
argument-hint: "<PR numbers> [--reviewer claude|codex|both] [--rounds N] [--publish]"
---

# Cross-review

You are the **coordinator** and the PR's **edit owner**: you launch the reviewers, adjudicate their reports, fix, verify, push and re-pin. Reports and handoffs travel as files in the task folder, so the maintainer relays nothing. Reviewers start fresh and only read. When another session owns edits, write the handoff (`docs/agents/workflow.md`) and let that owner run this skill; one editor at a time.

The maintainer decides policy, accepts gaps and risks, and authorizes merges and production access. Ask in **batches**: collect pending decisions, ask once, and keep working on everything that does not depend on the answer. A pending decision is asked once, not again each round.

A review result is only as good as its **pinned** head: any later head makes it **stale**.

Arguments:

- **PR numbers** (required): one PR or every PR of a stack.
- **`--reviewer claude|codex|both`**: default is the engine that did not implement the change, read from the PR's handoff or commits; use `both` when the implementer is mixed or unknown. `both` runs two independent reviews.
- **`--rounds N`**: fresh discovery rounds, default 1. Repeating a blind review is not reproducing a bug, so use more only for a deliberate high-risk change. Follow-up rounds (step 4) are separate.
- **`--publish`**: posts the report on the PR. Without it, the report stays a local draft.

## 1. Pin the target and collect inputs

For each PR, make a task folder outside the repo, `${TMPDIR:-/tmp}/kavtsya-review/<pr>-<head7>/`. Everything a reviewer may read goes in its `inputs/` subfolder; everything you write stays outside it, because the Claude reviewer can read only the worktree and `inputs/`.

1. `gh pr view <n> --json baseRefOid,headRefOid,isDraft,body,closingIssuesReferences,statusCheckRollup > inputs/github-pr.json`, then `git fetch`.
2. `git diff <base>...<head> > inputs/diff.patch`; it must be non-empty. A stack is pinned PR by PR, each against its own base. Its top PR's head is the **integration candidate**: the stack's contract evidence is established there.
3. `inputs/spec.md`: the closing issue's validation contract (the handoff template in `docs/agents/workflow.md`), else the PR body. `inputs/pr-body.md`: the PR body with the implementer's handoff and receipts.
4. Save every page the spec links or the diff cites as a receipt into `inputs/`: reviewers can't fetch. Write `inputs/index.md` listing each input and what it is, including any page that failed to save.
5. Add a task-owned reviewer worktree at the head: `git worktree add --detach <task>/wt <head>`.
6. Write `manifest.md`: PR, base and head SHAs, integration candidate (stacks only), implementer, edit owner, reviewers, owned resources, and `transport_relays: 0`.

**Done when** every PR has a pinned base and head, a non-empty `inputs/diff.patch`, a spec, an `inputs/index.md` covering every cited page, and a clean reviewer worktree at the head.

## 2. Run the reviewers

From a checkout that contains this skill, run one reviewer per engine with `run_in_background`:

```sh
node scripts/cross-review/run-reviewer.mjs --engine <claude|codex> --task <task> \
  --round <N> --worktree <task>/wt --base <base> --head <head> \
  [--previous <task-of-previous-head>/findings-r<N-1>.md]
```

The runner fills the canonical prompt (`reviewer-prompt.md`, plus `reviewer-follow-up.md` with `--previous`) with the pins and paths, so both engines get byte-identical prompts; to change what reviewers are asked, edit those templates. It launches the engine read-only, enforces a 20-minute deadline, stops the reviewer's whole process group, rejects a report whose header, axes or worktree state are wrong, and writes `review-r<N>-<engine>.outcome.json`. Run without arguments, it prints its usage.

With `both`, launch both runs in the same turn and adjudicate only after both outcome files exist.

Each outcome is **COMPLETE** or **INCOMPLETE** with a reason. Record an INCOMPLETE reason as such, never as "no findings". Rerun it once under a new round label (`--round 1b`; the runner never overwrites an outcome), then escalate.

Engine launch evidence, both read-only:

- **Codex**: codex-cli 0.162.1 on #324 and #325 (2026-10-14). Its read-only sandbox can read the whole filesystem, so its blindness to a parallel Claude report rests on the prompt.
- **Claude**: Claude Code 2.1.300, #301 pilot (2026-10-15). `--restricted --tools Read,Grep,Glob,Agent --strict-mcp-config` gave the reviewer and its sub-agents only those four tools and no MCP tools, confined file reads to the worktree and `inputs/`, and an adversarial write probe left the disk unchanged. `--restricted` skips user and project settings, so plugins and hooks don't load; the subscription login still works.

**Done when** every required reviewer has a COMPLETE outcome at the pinned head, or an INCOMPLETE one you have rerun once and escalated.

## 3. Adjudicate every finding

Check each finding yourself at the pinned head, whichever engine raised it: agreement between engines is not proof, and a finding only one engine raised can be right. A claimed regression is checked on the base too. Record one of:

- **CONFIRMED(source)**: the quoted code proves it.
- **CONFIRMED(runtime)**: a test or probe reproduces it. Use your own test database and ports (`docs/agents/workflow.md`).
- **PLAUSIBLE**: not reproduced; say what would confirm it.
- **DROPPED**: disproven; say how.

Keep **defects** and **gaps** apart. A documented procedure step that cannot succeed as written is a defect, even when the maintainer owns running it. A runtime result nobody has observed yet is a gap, and only the maintainer accepts it.

Write `<task>/findings-r<N>.md`: each finding with engine, axis, reviewer verdict, your adjudication and evidence, and disposition. It is the next round's `--previous`.

Then give every assertion of the spec's validation contract a disposition: the evidence that establishes it at the pinned head (for a stack, the integration candidate), usually a test that ran, or an explicit gap. A clean review or a green `pnpm verify` doesn't establish an assertion on its own.

**Done when** every finding has a verdict with evidence, and every contract assertion has evidence or a recorded gap.

## 4. Fix, then re-review

Fix the CONFIRMED findings in your edit checkout and run `pnpm verify`. Check that each new test goes red once the behaviour it guards is broken. Commit and push to the PR branch under the authorization you already hold. A push changes the head, which makes the round stale: go back to step 1 for the new head (new task folder and reviewer worktree), then step 2 with `--previous`. Earlier heads' files stay as they are.

**Converged** is a round with no new CONFIRMED finding: a clean discovery round converges on its own head and needs no follow-up. After 3 follow-up rounds without converging, stop and escalate to the maintainer as **not converging**: fixes that keep producing findings point to the design or the contract, not to another round.

**Done when** the final head has converged with no open CONFIRMED finding, or you have escalated.

## 5. Close out and report

Re-read `gh pr view <n> --json headRefOid,isDraft,closingIssuesReferences,statusCheckRollup`. A remote head other than your final pinned head makes the review stale: return to step 1. Flag a closing link or draft state that contradicts the PR body.

Write `<task>/report.md` in the final head's folder:

- the pinned base and final head, and the reviewers with their engine versions;
- a findings table: finding, engine, axis, reviewer verdict, adjudication with evidence, disposition, head that introduced the code;
- a contract table: assertion, evidence or gap, and whether the maintainer accepted the gap;
- the runtime evidence: `pnpm verify` exit code and counts, and any mutation checks;
- measures: maintainer transport relays, stale heads, findings by engine and verdict, INCOMPLETE runs with reasons, tooling incidents.

State three results separately:

- **Review complete**: every required reviewer is COMPLETE on the final head.
- **Converged**: no open CONFIRMED finding at the final head.
- **Contract ready**: every assertion has evidence at the final head or a gap the maintainer accepted, and no authorization or data-integrity finding is left PLAUSIBLE.

A clean review is not runtime evidence; an unaccepted gap stays in the report as a gap. Remove the task-owned reviewer worktrees with `git worktree remove`, keeping the task folders. With `--publish`, post the report with `gh pr comment <n> --body-file`. Merging and risk acceptance stay with the maintainer.

**Done when** the report exists with all three results, the reviewer worktrees are removed, and, with `--publish`, the report is posted.

## Comparing engines

Compare engines only on identical rendered prompts and inputs at the same head (`cmp` the runs' `prompt.txt` files). Count a later-round finding as a miss of the first review only if the code it cites existed at the first reviewed head; code introduced by a fix makes it a new finding. A fixed head superseding a review is normal; adjudicating on a stale report is the failure. One A/B run is a pilot, not a ranking.
