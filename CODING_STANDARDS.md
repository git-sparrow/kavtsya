# Coding standards

Reviewers, human or agent, apply these during code review. This file holds only **judgement calls**. Anything a tool can check belongs in ESLint, TypeScript, a test or CI, and the reviewer skips findings those tools already report.

## Also apply

- `AGENTS.md`, **Product principles**: a breach of the **non-negotiable floor** is a hard violation.
- `AGENTS.md`, **Working agreement**, "Keep it simple": flag added comments, docs or lines that restate code, issue history or another file.
- `GLOSSARY.md`: domain terms in identifiers, user-facing copy and comments.
- `docs/adr/`: a diff that contradicts an accepted ADR without superseding it.

## Rules

### Kept promises

A **stated guarantee** is an ADR, doc comment or code comment that promises behaviour, such as "never blocked", "sent at most once a day" or "only the owner can confirm".

- **Look for:** a diff that changes, or fails to deliver, behaviour a guarantee describes. This includes widening who can reach a guarded code path.
- **Fix:** restore the promised behaviour, or change the governing ADR or comment on purpose and say why in the diff. Either way, a test asserts the behaviour the guarantee now states.
- **Why:** #253, #251, and the PR #275 and PR #77 reviews.

### Async results applied to the state they started from

- **Look for:** async work whose result lands after the user or the app has changed the state it was started from, and then overrides that change. The work may be an animation end, a timer, a resolved request or a poll. Overriding means dismissing, clearing, navigating, writing or showing again.
- **Fix:** tie the result to the state it started from. Key the component by that state, cancel the work on change or unmount, check `finished` or a token before acting, or record the local change (for example, the dismissed id) so a stale result cannot undo it.
- **Why:** PRs #279 and #236.

