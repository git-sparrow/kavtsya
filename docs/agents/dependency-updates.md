# Dependency updates

How Kavtsya keeps dependencies fresh and safe: stable releases only, no version
conflicts, every change gated by CI. Read it before touching `pnpm-workspace.yaml`, an
app `package.json`, `.github/dependabot.yml`, or the mobile native surface. Each rule
carries its reason and the issue or PR that holds the full history.

## Version-authority model

Authority is layered by category: each kind of dependency has exactly one owner.

| Category | Source of truth | Where it lives |
| --- | --- | --- |
| What is actually installed | the **lockfile** | `pnpm-lock.yaml` |
| Mobile native surface — `react`, `react-native`, `expo`, `expo-*`, `@expo/*`, `react-native-*`, `@types/react` | the **Expo SDK** | `apps/mobile/package.json` (a faithful mirror; managed via `expo install`) |
| Cross-cutting shared libraries | a **pnpm catalog** | `pnpm-workspace.yaml` |
| App-local runtime deps | the owning app | `apps/api/package.json`, etc. |

- **Read resolved versions from `pnpm-lock.yaml`.** A `package.json` range is a
  constraint, not a fact.
- **Expo-governed packages move only on the [Expo track](#expo-track)**, never by hand
  or by automation: the SDK dictates them as a known-good set, and an out-of-band bump
  breaks the native build.
- **A library declared in two or more workspace packages lives in the catalog**; a
  library used by one app stays in that app's `package.json`.

## The pnpm catalog

Manifests reference catalog entries with `"<dep>": "catalog:"`, so there is one version
and it cannot diverge. Membership is the `catalog:` block in `pnpm-workspace.yaml`; a
dependency joins when a second workspace package declares it.

- `@better-auth/expo` shares the catalog with `better-auth` so the two auth halves move
  in lockstep. Both are JS-only and **not** Expo-governed despite the name.
- `vite` is catalog'd as vitest's peer: left undeclared, pnpm kept a stale vite 5 (#270).
- `typescript` is also declared at the repo root: pnpm's isolated layout links only a
  package's own dependencies, and `.vscode/settings.json` points `js/ts.tsdk.path` at the
  root `node_modules/typescript`, so the editor uses the same compiler as CI.
- **Not catalog'd:** the Expo-governed surface (managed by `expo install`), root-only
  tooling (`eslint`, `prettier`, `husky`, …: one home already), and app-local runtime deps.

To add or change an entry: edit `catalog:`, set each referencing manifest to `"catalog:"`,
`pnpm install`, then `pnpm verify`.

## Automated updates: Dependabot

`.github/dependabot.yml`, GitHub-native and config-only:

- **Ecosystems:** `npm` and `github-actions`.
- **One npm directory, `/`.** The root job covers every workspace manifest and the
  catalog. A per-member directory cannot regenerate the root lockfile, so its PR dies on
  `ERR_PNPM_OUTDATED_LOCKFILE` (#198 vs #202). Add a directory only for a package outside
  the workspace with its own lockfile.
- **Cadence: `monthly`**, 06:00 Europe/Kyiv on the 1st. A named interval has nothing to
  get wrong; the earlier biweekly `cron:` key was not in the schema, so Dependabot never
  ran once (#191).
- **Groups by update type:** all minor + patch in one PR, each major on its own, all
  Actions bumps in one PR. Not by dependency type: dependabot-core#14824 marks every
  catalog entry `production`.
- **Stable-only** is Dependabot's default while no manifest is on a prerelease.
- **Labels and prefixes:** `dependencies`; `chore(deps)`, `chore(deps-dev)`, `chore(ci)`.
- **pnpm ≥ 11.13.0** in `packageManager`: older pnpm trusts the Dependabot proxy's `304`
  and fails every job with `ERR_PNPM_CACHE_MISSING_AFTER_304`, which shows up only as
  Dependabot closing the PR (pnpm/pnpm#12882, #338).
- **Security updates and alerts** are enabled in the repository settings (2026-10-23).
  An advisory opens its own PR outside the monthly cadence.

### Changing `.github/dependabot.yml`

GitHub validates the file only on some PRs that touch it, so a missing red check proves
nothing (#185, #153, #195). On any change:

1. **Validate locally, both directions**: the new file passes and the form it replaces
   fails.

   ```sh
   curl -sLO https://json.schemastore.org/dependabot-2.0.json   # -L: it redirects
   npx --yes js-yaml .github/dependabot.yml > /tmp/cfg.json     # ajv reads JSON only
   npx --yes ajv-cli@5 validate --strict=false -s dependabot-2.0.json -d /tmp/cfg.json
   ```

   `-d` must be a real file (ajv reads it twice, a fifo yields once); `--strict=false`
   because the schema carries `x-intellij-enum-metadata`.
2. **Read it for meaning**: the per-member directories were schema-valid the whole time.
3. **Confirm a real run** after a schedule change: _Insights → Dependency graph →
   Dependabot_ shows "Last checked"; "Check for updates" forces a run.

### Why the Expo surface is frozen for automation

The npm `ignore` list holds the Expo-governed surface (`expo`, `expo-*`, `@expo/*`,
`react`, `react-native`, `react-native-*`, `@types/react`) plus packages coupled to it:

- `eslint-config-expo`: SDK-keyed major, but root-only tooling, so no pattern matches it
  and `expo install --fix` does not reach it. Bump it by hand on the Expo track.
- `@swmansion/argent`, `test-renderer` (`>=1.3.0`), `@sentry/react-native`: the reason
  sits beside each entry in the file.

`@better-auth/expo` and `@expo-google-fonts/*` are other scopes, JS-only, and stay
updatable; `react-native-qrcode-svg` is frozen with the rest of `react-native-*`.

### Peers are declared, never auto-installed

`pnpm-workspace.yaml` sets `autoInstallPeers: false` and `dedupePeerDependents: false`.
With either on, `apps/api` linked `@better-auth/expo`'s optional Expo peers from
`apps/mobile`, so every `better-auth` bump forked a second `expo` and Expo Doctor's
duplicate check failed (#295, #333). Only both settings off held (measured 2026-10-16,
pnpm 11.7.0); a `@types/react` pin (#336), either setting alone, and `overrides` that
remove the peer did not.

When `pnpm install` warns about a peer, run `pnpm peers check` and either:

- **declare it** in the workspace package that needs it, under that package's version
  authority; or
- **list it in `peerDependencyRules.ignoreMissing`** with a comment naming who supplies it
  or why it is never loaded.

Every acceptable miss is listed, so a new line in `pnpm peers check` is a real decision.

### Do not add `react-dom`

Mobile hooks are tested with **`test-renderer`**, which needs no DOM (#53).
`@testing-library/react`, `jsdom` and `react-dom` bring back a package that must match
`react` exactly, moves by hand on the Expo track, and, as an optional peer of
`better-auth` and `expo`, forks `expo` until Expo Doctor fails. Its only wanters are
web-only DOM components, so it sits in `ignoreMissing`. Rendering React Native components
(not just hooks) is a test-runner decision for the ADR, not a dependency to add.

## CI safety net

Every update PR passes the gate in `.github/workflows/ci.yml` before it can merge:

- `pnpm verify`: `agents:check`, `deps:check` (peers clean, `apps/api` off the Expo
  graph, no `react-dom`), `typecheck`, `lint`, `format:check`, and `test`, where the API
  suite runs against a real Postgres.
- **Expo surface, Dependabot PRs only**: `scripts/deps-check/expo-surface.mjs` compares
  the lockfile's resolved versions of every `ignore`-list package with the PR's base,
  transitive ones included. A move that leaves major.minor (`0.minor` on 0.x), a new
  version beside an old one, or an added or removed package fails. A patch move inside
  the same contract is a warning ([drift, not a defect](#patch-drift-inside-an-sdk-is-not-a-defect)).
  The Expo track moves these packages on purpose, so other PRs skip the step; #332 would
  have failed on `expo-modules-jsi` 57.0 → 57.1.
- **`expo-doctor`** in `apps/mobile`: duplicate and overridden dependencies, peers, Expo
  config, Metro config, native-module support packages.

### Gate vs monitor: one expo-doctor check runs elsewhere

Twenty of expo-doctor's 21 checks are a function of the diff and gate every PR. The
twenty-first, "packages match versions required by installed Expo SDK", reads Expo's
**live** version map and goes red on a commit that changed nothing once Expo ships a
patch. On the gate it taught merging through red (`main` red from 2026-07-29 to #167).

| Where | What runs | Role |
| --- | --- | --- |
| `ci.yml`, every PR | `expo-doctor@<pinned>` with `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` | **gate** |
| `expo-sdk-check.yml`, 1st and 15th + `workflow_dispatch` | full `expo-doctor`, floating | **monitor**: opens a drift issue |

Both set `EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS=1`. The monitor does not gate PRs (#232):
`expo` shipped 20 releases in SDK 57 at a median 3 days apart, so the aligned window is
2–3 days. Every real defect so far (#212, #223, #224/#226) was caught by the duplicate or
overridden checks that do gate.

### Patch drift inside an SDK is not a defect

The contract is the SDK major. Realign on the drift issue, or when a fix needs a newer
patch, and never to make a check green: that drags unrelated native bumps into whatever
PR is open. A realign that moves the native surface is its own Expo-track PR, with a
dev-build rebuild and a smoke test.

### Pin the gate's expo-doctor; leave the monitor's floating

`npx expo-doctor` resolves `latest` at run time, so an unpinned gate changes its verdict
on Expo's schedule: the same lockfile passed on 1.20.3 and failed on 1.20.4 (#224). The
gate pins an exact version; the monitor floats, because noticing the outside world is its
job. Bump the pin by hand on the Expo track, **in the same PR that fixes what the new
version finds** (#226). Dependabot cannot see a version inside an `npx` string, and as a
devDependency `expo-doctor` would match the `expo-*` ignore anyway.

### Transitive Expo packages float through the freeze

The `ignore` list stops Dependabot editing a manifest, not a lockfile re-resolution
floating an Expo-governed package in transitively, and `expo install --fix` touches only
declared packages (#212, #223, `@expo/dom-webview`). On a Dependabot PR the Expo surface
step in `ci` names the package.

**Fix: declare it with `expo install <pkg>` in `apps/mobile`**, so the SDK map owns its
version (#226: one manifest line, nothing else moved). Measured 2026-08-30 on pnpm 11.7.0,
these fail: `pnpm install --resolution-only` (no-op), `overrides:` (do not reach
auto-installed peer edges), deleting entries plus `--fix-lockfile` ("Already up to
date"), and `pnpm update -r <pkg>` (floats `@expo/cli` and friends). Never hand-edit
`pnpm-lock.yaml`. Declaring widens peer suffixes elsewhere (`react-dom@19.2.7` went from
34 to 74 occurrences), so read that part of the diff.

Keep the packages visible to `expo install --check`: `expo.install.exclude` would blind the
Expo track itself.

## The maintainer's recurring task

1. **The monthly grouped Dependabot PR:** if `ci` and `e2e-android` are green on its
   head, the checks have done the mechanical review; merge it. **On red CI, or for a
   major or `0.x` minor**, take it to merge-ready in an agent session (#345): diagnose,
   then hold the package on a branch from `main` (#340) and `@dependabot recreate`.
2. **The Expo drift issue** (`expo-sdk-check.yml`, the 1st and 15th; one open at a time):
   run the Expo track below. A full SDK release follows the `expo:upgrading-expo` skill.
3. **An Argent drift issue** (`argent-drift-check.yml`, monthly): decide upgrade or
   retain, as #263 did, per [Updating Argent](../argent-howto.md#updating-argent).

<a id="expo-track"></a>

## Expo track (deliberate, human-run)

The native surface is realigned only through Expo's own tooling, keyed to SDK releases.
For a full SDK jump, follow the `expo:upgrading-expo` skill.

`expo-camera` has a version-scoped native patch for adaptive Customer QR scanning
(#372). Its SDK-governed version stays unchanged by the patch; iOS builds compile
this module from source so the patch is used. Before an Expo realignment that moves
its version:

1. Preserve the current patch, then temporarily remove its exact-version entry
   from `patchedDependencies` in `pnpm-workspace.yaml`. Otherwise pnpm rejects the
   now-unused patch during installation. Do not build or ship the app in this
   temporary unpatched state.
2. Run the Expo track below. On the newly installed SDK-approved camera version,
   use `pnpm patch expo-camera@<installed-version>`, port the adaptive scanner
   changes, then run `pnpm patch-commit <edit-directory>` to register the new patch.
   Remove the obsolete patch file after the replacement is registered.
3. Keep `expo.autolinking.ios.buildFromSource` including `expo-camera` in the mobile
   manifest. Regenerate iOS output/Pods and confirm the Pod report does not list
   ExpoCamera among precompiled modules; rebuild and check that the patched Swift
   source is compiled. Re-run the scanner's physical-device acceptance matrix
   before treating the port as verified. If upstream replaces the patch, remove
   the app's custom lens opt-in deliberately and verify equivalent behavior.

Patch mechanics and source-build configuration checked 2026-10-27 against the
[pnpm patch docs](https://pnpm.io/cli/patch),
[Expo source-build docs](https://docs.expo.dev/guides/prebuilt-expo-modules/) and the
installed Expo camera/autolinker sources.

Core recipe:

```bash
# From apps/mobile:
npx expo install --check   # detect drift against the installed SDK (report only)
npx expo install --fix     # realign every Expo-governed package to the SDK's set
npx expo-doctor            # validate the mobile dependency graph

# From the repo root — `expo install --fix` does not reach outside apps/mobile:
pnpm add -w -D eslint-config-expo@^<major>.0.0   # match the new SDK major
```

On a full SDK jump, also regenerate the CNG output (`ios` and `android` are git-ignored
build artefacts):

```bash
# From apps/mobile:
rm -rf ios android .expo && watchman watch-del-all
npx expo prebuild --clean
```

- **`@sentry/react-native`** is held on 8.x ahead of the SDK's pin (ADR 0019, approved
  2026-10-21). `expo.install.exclude` keeps `expo install` and the full Expo Doctor off
  it. On each pass, move it to the latest stable 8.x by hand
  (`pnpm --filter @kavtsya/mobile add @sentry/react-native@~<version>`) after reading its
  changelog for the new React Native; drop the exclusion once the SDK catches up.
- **`test-renderer`**: once the SDK ships React ≥ 19.3, drop its `ignore` entry and move
  `apps/mobile` off `~1.2.0` (1.3 needs `react-reconciler` 0.34).

Then `pnpm verify`, and for a real SDK jump a simulator smoke test
(`docs/argent-howto.md`). `expo install --fix` picks the versions the installed SDK
blesses: it is the freeze working, not an independent bump.

### Run the track a day after Expo publishes

pnpm 11's `minimumReleaseAge` defaults to 24h, and the drift monitor fires because Expo
just published. pnpm then offers to write a `minimumReleaseAgeExclude` list into
`pnpm-workspace.yaml`. **Leave it out of the commit**: it waives the supply-chain guard
for exactly the packages that reach native code, and it would grow on every run. The
cutoff is rolling:

```bash
git checkout pnpm-workspace.yaml   # drop the block pnpm appended
# …once 24h have passed since the release:
pnpm install --frozen-lockfile     # same lockfile, now passes
```

The realigned lockfile needs no re-resolving. A committed too-fresh entry fails
`pnpm install --frozen-lockfile` with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, so CI
catches a bypass too.
