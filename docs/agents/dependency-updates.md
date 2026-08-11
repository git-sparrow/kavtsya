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
| `typescript` | root, api, shared, mobile | was drifting (`^5.6.3` vs `~6.0.3`) |
| `vitest` | api, mobile | was drifting (`^2.1.8` vs `^2.1.9`) |
| `zod` | api, shared | shared validation schemas |
| `better-auth` | api, mobile | auth server + client halves |
| `@better-auth/expo` | api, mobile | moves in lockstep with `better-auth` |

`@better-auth/expo` shares the catalog with `better-auth` so the two auth halves can
never diverge. Both are scoped, `^`-ranged, JS-only packages — **not** Expo-governed,
despite the `expo` in the name — so they stay automatically updatable.

`typescript` is declared at the **repo root** as well as in the three workspace
packages, which looks redundant and is not. pnpm's isolated layout links only a
package's own dependencies, so without the root declaration there is no
`node_modules/typescript` at the root at all — and `.vscode/settings.json` points
`js/ts.tsdk.path` there so the editor reports errors with the same compiler as
`pnpm typecheck` and CI, instead of the older one VS Code bundles. It also makes
explicit what `typescript-eslint` was already relying on as an auto-installed peer.
Because all four declarations read `catalog:`, the extra home cannot introduce drift.

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
- **Cadence: monthly** — `interval: "monthly"` at `06:00 Europe/Kyiv` fires on the 1st.
  This deliberately replaced a biweekly cron schedule that never worked; see
  [why the schedule is boring](#boring-schedule) before changing it.
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

<a id="boring-schedule"></a>

### Why the schedule is boring — and how a broken config stayed silent

The cadence used to be biweekly (the 1st and 15th) via `interval: "cron"`. It never ran
**once**. The schedule carried a `cron:` sub-key, which is not in Dependabot's schema at
all — the expression key is `cronjob` — so GitHub rejected the file outright:

```
The property '#/updates/0/schedule' contains additional properties ["cron"]
outside of the schema when none are allowed
```

A rejected config is not a degraded config: nothing runs. That cost this repo every
Dependabot update between the config landing (`31e1cc4`, the SDK 56 → 57 track) and #191.

**The expensive part was the silence, not the typo.** GitHub validates
`.github/dependabot.yml` only on a PR that *touches the file*, so a config broken at
birth never gets a second look — no red check anywhere, just an automation that quietly
does not exist. It surfaced only because an unrelated PR happened to edit a nearby line.

Worse, **the config check cannot be used as a gate.** Dependabot posts it as a check run
named `.github/dependabot.yml`, but only sometimes: it appeared on #185 (failing, on a PR
that edited an unrelated line) and did **not** appear at all on #153 (which introduced the
broken file) or on #195 (which fixed it). A red one is proof of breakage; its absence is
proof of nothing. Never read "no complaint" as "valid".

So, two standing rules for this file:

1. **Validate it yourself, locally, on any change.** Do not wait to be told. The config is
   plain YAML against a published JSON Schema:

   ```sh
   curl -sLO https://json.schemastore.org/dependabot-2.0.json   # -L: it redirects
   npx --yes js-yaml .github/dependabot.yml > /tmp/cfg.json     # ajv reads JSON only
   npx --yes ajv-cli@5 validate --strict=false -s dependabot-2.0.json -d /tmp/cfg.json
   ```

   Two footguns in that recipe, both hit while writing it: without `-L` you download an
   HTML redirect page, and `-d` must be a real file — a `<(…)` process substitution fails,
   because ajv reads the input twice and a fifo only yields once. `--strict=false` is
   required because the schema carries an `x-intellij-enum-metadata` keyword.

   A good check confirms **both directions** — that the new config passes *and* that the
   form you are replacing fails. If a red `.github/dependabot.yml` check also shows up on
   the PR, treat it as a bonus signal, not the signal.

2. **Confirm a real run, not just a valid file** — a valid config that never fires looks
   exactly like this bug did. _Insights → Dependency graph → Dependabot_ shows "Last
   checked" per ecosystem, and its "Check for updates" button forces a run immediately
   instead of waiting for the 1st. **Do this after merging any schedule change.**

`monthly` was chosen over a corrected `cronjob:` expression on purpose. Cron scheduling
carries failure modes a named interval simply does not have — runaway job storms
([dependabot-core#14035][14035]), biweekly expressions silently degrading to weekly
([dependabot-core#12246][12246]), and a day-of-month/day-of-week combination that ORs
rather than ANDs. Those specific bugs are fixed upstream (checked 2026-08-11), but the
whole class is avoidable, and given that nothing had run at all, **reliable once a month
beats elegant twice a month.** The cost is one skipped run per month; the gain is a
schedule with nothing to get wrong.

### Why grouping is by update-type, not dependency-type

A known Dependabot bug ([dependabot-core#14824][14824]) misclassifies **all** pnpm
catalog entries as `dependency-type: production`. A production-vs-development grouping
split would therefore be unreliable. Grouping on **update level** (minor/patch vs major)
sidesteps the bug entirely and gives us the review rhythm we actually want.

### Why the Expo surface is frozen for automation

`.github/dependabot.yml` **ignores** the entire Expo-governed surface: `expo`, `expo-*`,
`@expo/*`, `react`, `react-native`, `react-native-*`, `@types/react`, and
`eslint-config-expo`. These versions are dictated by the installed Expo SDK as a
known-good, SDK-validated set. An independent bump — even a patch — can break the native
build, so automation must never touch them. They are realigned only on the
[Expo track](#expo-track).

`eslint-config-expo` is the one Expo-governed package that is **not** matched by the
name patterns: its major tracks the SDK (56.x for SDK 56, 57.x for SDK 57), but it is
root-only tooling, so it lives in the repo-root `package.json` alongside `eslint` and
`prettier` rather than in `apps/mobile`. It is therefore ignored by exact name and
bumped by hand on the Expo track — `expo install --fix` does not reach outside
`apps/mobile` and will not realign it for you.

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
  set is coherent, so config, peer-dependency and native-module incompatibility is
  caught automatically before merge.

A bad update cannot merge green.

### Gate vs monitor: why one expo-doctor check runs elsewhere

`expo-doctor` runs 21 checks. Twenty are a pure function of the repo — Expo config
schema, duplicate and overridden dependencies, missing peer deps, Metro config,
committed env files, `@react-navigation` alongside `expo-router`, native-module
support-package compatibility. Those belong on the merge gate: they fail because of
*your diff*.

One is not: **"Check that packages match versions required by installed Expo SDK"**
resolves its expected set from Expo's **live** version map. It turns red the moment
Expo publishes a patch inside the current SDK, on a commit that changed nothing. On
the merge gate that is corrosive — it reddens unrelated PRs on Expo's release
schedule, and teaches everyone to merge through red, which destroys the gate for the
twenty checks that *are* about the diff. (It happened: `main` sat red from
2026-07-29 until #167, discovered only because it also reddened an unrelated feature
PR.)

So the split is:

| Where | What runs | Role |
| --- | --- | --- |
| `ci.yml`, every PR | `expo-doctor` with `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` | **gate** — blocks merge |
| `expo-sdk-check.yml`, PRs touching `apps/mobile/package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` | full `expo-doctor` | **gate** — the strict version match, where a dependency change makes it meaningful |
| `expo-sdk-check.yml`, fortnightly + `workflow_dispatch` | full `expo-doctor` | **monitor** — opens a drift issue, see below |

Both jobs also set `EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS=1`: several checks call Expo's
API, and a network blip is not a broken PR.

Note this is *not* a job for `expo.install.exclude` (which `expo-doctor`'s own advice
suggests). That key would also hide those packages from `expo install --check`,
blinding the Expo track itself. Never silence the packages; move the check.

## The maintainer's recurring task

1. When the monthly grouped Dependabot PR arrives, **review it tests-first** (as usual)
   and merge if the gate is green. Majors arrive as their own PRs — merge or hold each
   independently.
2. **Separately, when the Expo drift issue appears,** run the Expo track below. This is
   judgment-heavy and stays a human decision, not automation — but you no longer have to
   remember to look: `.github/workflows/expo-sdk-check.yml` runs the full `expo-doctor`
   on the 1st and 15th and opens an issue labelled `dependencies` when the mobile set has
   fallen behind the installed SDK (one issue at a time; it stays open until the track is
   run). A full SDK release still arrives the usual way — via Expo's own announcements —
   and follows the `expo:upgrading-expo` skill.

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

# From the repo root — `expo install --fix` does not reach outside apps/mobile:
pnpm add -w -D eslint-config-expo@^<major>.0.0   # match the new SDK major
```

On a full SDK jump, also regenerate the CNG native output so it is rebuilt against the
new SDK (`apps/mobile/ios` and `android` are git-ignored build artefacts, not sources):

```bash
# From apps/mobile:
rm -rf ios android .expo && watchman watch-del-all
npx expo prebuild --clean
```

Then run the full gate (`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`)
and, for a real SDK jump, smoke-test the app in the simulator (see `docs/argent-howto.md`).

`expo install --fix` is the sanctioned mechanism for changing an Expo-governed version —
it picks the version the installed SDK blesses. It is **not** an "independent bump", so it
does not violate the freeze; it is the freeze working as intended.

[12246]: https://github.com/dependabot/dependabot-core/issues/12246
[14035]: https://github.com/dependabot/dependabot-core/issues/14035
[14824]: https://github.com/dependabot/dependabot-core/issues/14824
