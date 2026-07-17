# Dependency updates

How Kavtsya keeps its dependencies fresh **safely by construction**: stable releases
only, no version conflicts, and every change gated by CI before it can merge. This is
maintainer-facing tooling — read it before touching `pnpm-workspace.yaml`, the app
`package.json` files, `.github/dependabot.yml`, or the mobile native surface.

There is no single global "source of truth" for versions. Authority is **layered by
category** — each kind of dependency has exactly one place that owns its version.

## Version-authority model

| Category | Source of truth | Where it lives |
| --- | --- | --- |
| What is actually installed | the **lockfile** | `pnpm-lock.yaml` |
| Mobile native surface — `react`, `react-native`, `expo`, `expo-*`, `@expo/*`, `react-native-*`, `@types/react` | the **Expo SDK** | `apps/mobile/package.json` (a faithful mirror; managed via `expo install`) |
| Cross-cutting shared libraries | a **pnpm catalog** | `pnpm-workspace.yaml` |
| App-local runtime deps | the owning app | `apps/api/package.json`, etc. |

Practical consequences:

- **Never reason about what is installed by reading a `package.json` range.** A range
  (`^`, `~`) is a constraint, not a fact. `pnpm-lock.yaml` is the only truth for the
  resolved version.
- **Never bump an Expo-governed package by hand or let automation do it.** Those
  versions are dictated by the installed Expo SDK; an out-of-band bump breaks the
  native build. They move only on the deliberate [Expo track](#expo-track) below.
- **A library used in two or more workspace packages lives in the catalog**, so its
  version cannot drift apart between packages.
- **A library used in only one app stays in that app's `package.json`** — app-local
  concerns are not hoisted into a shared authority they do not belong to.

## The pnpm catalog

The `catalog:` block in `pnpm-workspace.yaml` is the single definition for every
dependency declared in more than one workspace package. Referencing manifests use the
`catalog:` protocol (e.g. `"typescript": "catalog:"`) instead of a literal range, so
there is exactly one version and it cannot diverge.

**Current membership** (a dep joins when it is declared in ≥ 2 workspace packages):

| Dependency | Declared in | Why catalog'd |
| --- | --- | --- |
| `typescript` | api, shared, mobile | was drifting (`^5.6.3` vs `~6.0.3`) |
| `vitest` | api, mobile | was drifting (`^2.1.8` vs `^2.1.9`) |
| `zod` | api, shared | shared validation schemas |
| `better-auth` | api, mobile | auth server + client halves |
| `@better-auth/expo` | api, mobile | moves in lockstep with `better-auth` |

`@better-auth/expo` shares the catalog with `better-auth` so the two auth halves can
never diverge. Both are scoped, `^`-ranged, JS-only packages — **not** Expo-governed,
despite the `expo` in the name — so they stay automatically updatable.

**Not catalog'd, on purpose:**

- **Expo-governed packages and `@types/react`** — Expo-mirrored, managed via
  `expo install` (see below).
- **Root-only tooling** (`eslint`, `prettier`, `husky`, `lint-staged`,
  `typescript-eslint`, `eslint-config-*`) — already has a single home in the repo-root
  `package.json`; catalog'ing single-home deps would add indirection for no gain.
- **App-local runtime deps** (`hono`, `pg`, `postgres`, `@hono/node-server`,
  `@types/pg`, `tsx` for the API) — owned by the app that uses them.

### Adding or changing a catalog entry

1. Add/update the version under `catalog:` in `pnpm-workspace.yaml`.
2. In each referencing `package.json`, set the dependency to `"catalog:"`.
3. `pnpm install` to update the lockfile.
4. Run the gate (`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`).

When a dep newly appears in a second workspace package, move it into the catalog at
that point rather than duplicating a literal range.

## Automated updates: Dependabot

`.github/dependabot.yml` opens grouped, stable-only update PRs. No third-party GitHub
App and no paid infrastructure — Dependabot is GitHub-native and config-only.

- **Two ecosystems:** `npm` (the whole pnpm workspace, all four manifests including the
  repo root, which carries the catalog) and `github-actions` (CI tooling).
- **Cadence: ~biweekly** — a `cron` schedule (`0 6 1,15 * *`, `Europe/Kyiv`) fires on
  the 1st and 15th. Dependabot's native `interval` values are only daily/weekly/monthly;
  `cron` is the supported mechanism for a two-week rhythm.
- **Grouping — as few PRs as possible:**
  - All **minor + patch** updates batch into **one** grouped PR.
  - Each **major** update opens its **own** PR for individual scrutiny (majors are left
    ungrouped on purpose).
  - All GitHub Actions bumps batch into one PR.
- **Stable-only:** this is Dependabot's default — it never proposes betas / RCs /
  pre-releases unless a manifest is already on one (ours are not). No extra config; the
  intent is recorded here.
- **Labels & commit prefixes:** every PR is labelled `dependencies`; commits are
  prefixed `chore(deps)` / `chore(deps-dev)` / `chore(ci)`.
- **Catalog support:** Dependabot updates `catalog:` entries in `pnpm-workspace.yaml`
  directly (GA since 2025-02-04), so catalog'd deps stay fresh automatically.

### Why grouping is by update-type, not dependency-type

A known Dependabot bug ([dependabot-core#14824][14824]) misclassifies **all** pnpm
catalog entries as `dependency-type: production`. A production-vs-development grouping
split would therefore be unreliable. Grouping on **update level** (minor/patch vs major)
sidesteps the bug entirely and gives us the review rhythm we actually want.

### Why the Expo surface is frozen for automation

`.github/dependabot.yml` **ignores** the entire Expo-governed surface: `expo`, `expo-*`,
`@expo/*`, `react`, `react-native`, `react-native-*`, and `@types/react`. These versions
are dictated by the installed Expo SDK as a known-good, SDK-validated set. An independent
bump — even a patch — can break the native build, so automation must never touch them.
They are realigned only on the [Expo track](#expo-track).

> **Do not "helpfully" bump an Expo package.** `react-native-qrcode-svg` is `^`-ranged
> and looks updatable, but it is frozen wholesale with the rest of `react-native-*` for
> native-peer safety; it is reviewed during the Expo track. Conversely,
> `@better-auth/expo` and `@expo-google-fonts/*` are **not** Expo-governed (different
> scopes, JS-only) and stay updatable — the ignore patterns above deliberately do not
> match them.

## CI safety net

Every update PR must pass the full gate in `.github/workflows/ci.yml` before it can
merge green:

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`
- `pnpm test` — the API suite runs against a **real** Postgres service (no mocks)
- **`npx expo-doctor`** (run in `apps/mobile`) — validates that the mobile dependency
  set is coherent with the installed Expo SDK, so native-dependency drift or
  incompatibility is caught automatically before merge.

A bad update cannot merge green.

## The maintainer's recurring task

1. When the biweekly grouped Dependabot PR arrives, **review it tests-first** (as usual)
   and merge if the gate is green. Majors arrive as their own PRs — merge or hold each
   independently.
2. **Separately, per Expo SDK release,** run the Expo track below. This is judgment-heavy
   and stays a human decision, not automation.

<a id="expo-track"></a>

## Expo track (deliberate, human-run)

The mobile native surface is realigned to a known-good set **only** through Expo's own
tooling, keyed to Expo SDK releases — never by an out-of-band or automated bump. For a
full SDK version jump (e.g. SDK 56 → 57), follow the `expo:upgrading-expo` skill; the
core realignment recipe is:

```bash
# From apps/mobile:
npx expo install --check   # detect drift against the installed SDK (report only)
npx expo install --fix     # realign every Expo-governed package to the SDK's set
npx expo-doctor            # validate the whole mobile dependency graph is coherent
```

Then run the full gate (`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`)
and, for a real SDK jump, smoke-test the app in the simulator (see `docs/argent-howto.md`).

`expo install --fix` is the sanctioned mechanism for changing an Expo-governed version —
it picks the version the installed SDK blesses. It is **not** an "independent bump", so it
does not violate the freeze; it is the freeze working as intended.

[14824]: https://github.com/dependabot/dependabot-core/issues/14824
