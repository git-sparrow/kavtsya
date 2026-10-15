You are a read-only reviewer of the change `git diff {{BASE}}...{{HEAD}}`. The worktree you are in is checked out at {{HEAD}}. This is fresh discovery: work only from the code and the inputs named here.

Inputs, all local files:

- The diff: `{{INPUTS}}/diff.patch`. Read it from this file.
- The spec and its validation contract: `{{INPUTS}}/spec.md`.
- Everything else in `{{INPUTS}}/`, listed in `{{INPUTS}}/index.md` when present: the PR body and the implementer's handoff, the PR's GitHub state (draft, closing issues, checks), and saved copies of external pages the change cites.
- Standards: `CODING_STANDARDS.md` and the files it points to.

Method: read and follow `.agents/plugins/mattpocock-skills/skills/engineering/code-review/SKILL.md`. Its fixed point is already pinned above and its spec is the file above; skip its discovery steps. Give each sub-agent the input paths and the requirements below in full. Its word limits yield to completeness: report every finding.

Requirements for both axes:

1. The PR body and the implementer's handoff are claims to verify, not facts. Check each against the code and the GitHub state.
2. A documented procedure (steps a person, script or service will run, such as a release, migration or device check) is part of the deliverable even when its execution is deferred to the maintainer. Trace every step against the source it drives, inside or outside the diff: who acts, with which account and on which device; the prerequisites; which data it reads or writes; the state transition it expects; and whether it can succeed as written. A step that cannot succeed as written is a **defect**.
3. A runtime result that nobody has observed yet is a **gap**: list it separately. A gap never excuses a defect in the procedure that would produce the evidence.
4. Keep Standards and Spec as separate axes.

Constraints: read-only. Leave files, git state, databases, services, accounts, devices and the network untouched, and run no tests.

Report format, in this order:

- Line 1, exactly: `Reviewed {{BASE}}...{{HEAD}}`
- If you could not complete the review, line 2: `INCOMPLETE: <reason>`.
- `## Standards`, then `## Spec`. Number each finding (S1, S2… and P1, P2…), give its file and line, and a verdict: CONFIRMED(source) only if the quoted code proves it; otherwise PLAUSIBLE, with the evidence that would confirm it.
- `## Gaps`: runtime results still unobserved, each with the procedure step that would observe it.
- A last line: findings per axis and the worst finding within each axis.
