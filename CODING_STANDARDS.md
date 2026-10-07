# Coding standards

Reviewers, human or agent, apply these during code review. This file holds only **judgement calls**. Anything a tool can check belongs in ESLint, TypeScript, a test or CI, and the reviewer skips findings those tools already report.

Each rule says what to look for in a diff and what the fix is. Report a likely breach with the hunk you are quoting, as a judgement call.

## Also apply

- `AGENTS.md`, **Product principles**: a breach of the **non-negotiable floor** is a hard violation.
- `GLOSSARY.md`: domain terms in identifiers, user-facing copy and comments.
- `docs/adr/`: a diff that contradicts an accepted ADR without superseding it.

## Rules

### Kept promises

A **stated guarantee** is an ADR, doc comment or code comment that promises behaviour, such as "never blocked", "sent at most once a day" or "only the owner can confirm".

- **Look for:** a diff that changes, or fails to deliver, behaviour a guarantee describes. This includes widening who can reach a guarded code path.
- **Fix:** restore the promised behaviour, or change the governing ADR or comment on purpose and say why in the diff. Either way, a test asserts the behaviour the guarantee now states.
- **Why:** four defects so far were promises the code did not keep: #253 (a deletion that was "never blocked" was blocked), #251 (a guard's justification went stale when ADR 0013 widened the counter), the PR #275 review (30 days promised, up to 31 delivered) and the PR #77 review (a comment named a model that was no longer the default).

### Async results applied to the state they started from

- **Look for:** async work whose result lands after the user or the app has changed the state it was started from, and then overrides that change. The work may be an animation end, a timer, a resolved request or a poll. Overriding means dismissing, clearing, navigating, writing or showing again.
- **Fix:** tie the result to the state it started from. Key the component by that state, cancel the work on change or unmount, check `finished` or a token before acting, or record the local change (for example, the dismissed id) so a stale result cannot undo it.
- **Why:** in PR #279 an exit animation's completion dismissed the next notice. In PR #236 a poll, restarted by an optimistic dismiss, returned the same Ворожка before the server had recorded the dismissal, so it appeared again.

## Adding a rule

A rule earns a place here when a review finding shows a gap that no tool can close. A finding that recurs comes first. A mechanical rule becomes a lint, type or test check instead (#297). Each rule cites its evidence.
