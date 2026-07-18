# Contributing to Kavtsya (Кавця)

Thanks for helping out. This is a small monorepo (`apps/mobile` + `apps/api` +
`packages/shared`) with a deliberately simple, strict workflow. Read this once;
it's short.

## The one rule: everything lands via a Pull Request

**No one commits directly to `main` — not features, not fixes, not docs, not the
maintainer.** `main` is always releasable, and every change gets a second pair
of eyes (human or CI) before it merges.

A local `pre-push` hook (`.husky/pre-push`, installed automatically by
`pnpm install`) refuses a direct push to `main` as a safety net. Server-side
branch protection on GitHub is the real guarantee and switches on once the repo
is public or on a paid plan; until then the hook plus this convention are what
we rely on, so please don't route around them.

## Workflow

1. **Branch off `main`.** Name it by intent:
   - `feat/<slug>` — new capability
   - `fix/<slug>` — bug fix
   - `chore/<slug>` / `docs/<slug>` / `refactor/<slug>` — everything else

   ```sh
   git switch main && git pull
   git switch -c feat/short-description
   ```

2. **Make the change.** Match the surrounding code. Use the domain glossary in
   [`CONTEXT.md`](CONTEXT.md) exactly — **Зернятко** not "point/stamp",
   **CafeOwner** not "owner", **Purchase** not "transaction", **Ворожка** for
   the coffee fortune. Product bar and priorities live in
   [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) and [`CLAUDE.md`](CLAUDE.md).

3. **Run the gate locally before you push:**

   ```sh
   pnpm verify   # typecheck + lint + format:check + full test suite
   ```

   The API suite needs Postgres — `pnpm db:up` first (see below). This is the
   same gate CI runs, so a green `verify` means a green PR.

4. **Push your branch and open a PR:**

   ```sh
   git push -u origin HEAD
   gh pr create        # or use the GitHub UI
   ```

5. **CI must be green and the branch up to date with `main` before merge.**
   Address review comments by pushing more commits to the same branch.

## Commits

Conventional-commit style, matching the existing history:

```
feat(api): surface today's Ворожка pool count on /health (#116)
fix(mobile): …
chore: …
```

Reference the issue (`#123`) in the subject or body. Keep the body to *why*, not
*what* — the diff already says what.

## Local setup

```sh
pnpm install          # also installs the husky hooks
pnpm db:up            # Postgres in Docker for the API + tests
pnpm migrate          # apply migrations
pnpm dev:api          # Hono API
pnpm dev:mobile       # Expo (mobile)
```

Issues are tracked in [GitHub Issues](https://github.com/git-sparrow/kavtsya/issues);
labels and triage are described under `docs/agents/`.

## Tests

- Prefer test-first at the seams (there's a vendored `/tdd` workflow skill).
- API tests run against a **real** Postgres (no mocks) and drive the app through
  the HTTP seam — see `apps/api/test/`.
- Run a single file while iterating; run the full suite (`pnpm verify`) before
  pushing.

Questions? Open an issue or a draft PR and ask there.
