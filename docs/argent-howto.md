# Argent — Claude drives the app in the simulator (#79)

[Argent](https://github.com/software-mansion/argent) (Software Mansion) gives an AI assistant
direct control of the iOS simulator: boot a device, launch the app, read the screen, tap, type,
screenshot, record & replay flows, diff screenshots, and profile React Native. We use it for two
things, in priority order:

1. **The design iteration loop with Mari** — Claude edits a screen, opens it in the simulator,
   posts a screenshot; Mari judges. See [the Mari loop](#the-mari-design-loop--дизайн-цикл-з-мар%D1%96) below.
2. **Agent-driven E2E / visual checks** on the core flows (scan → Зернятко → fortune; Redemption) —
   complements the unit-test runner, does not replace it.

## What is installed (and how)

Local mode, same philosophy as our vendored skills — everything travels with the repo, no
per-machine global installs:

- **`@swmansion/argent`** pinned **exactly** (`0.20.0`, pre-1.0 API churn) in the root
  `devDependencies`. `pnpm install` is the whole setup on a fresh clone.
- **`.mcp.json`** (committed) registers the MCP server for Claude Code. It runs the project-local
  copy (`node node_modules/@swmansion/argent/dist/cli.js mcp`) — nothing machine-specific in it.
  Claude Code asks each user to approve the server on first use, and the session must be
  **restarted** after `pnpm install` for the `mcp__argent__*` tools to load.
  > Issue #79 originally called for gitignoring the MCP registration as "machine config". The
  > generated config turned out to be fully project-relative (and Argent's own team-setup guidance
  > says to commit it), so we commit it — the decision's real intent was "no per-machine steps",
  > and this is exactly that.
- **Skills** in `.agents/skills/argent-*` with `.claude/skills/` symlinks, tracked in
  `skills-lock.json` — the wizard followed our vendored-skills layout on its own.
- **Rules & agent**: `.claude/rules/argent.md` (always-on guidance),
  `.claude/agents/argent-environment-inspector.md`.
- **`.argent/install.json`** records local mode so future `argent init` runs (and teammates') stay
  local.
- `pnpm-workspace.yaml → allowBuilds` approves Argent's native build scripts (node-pty,
  tree-sitter, webtransport) — without those entries pnpm skips the builds and the MCP server
  won't start.

**Pruned from the wizard's output** (restore any time by re-running
`./node_modules/.bin/argent init --local`): `argent-tv-interact` (no TV app, and none planned —
Kavtsya is a phone app) and `.vscode/mcp.json` (gitignored anyway; nobody drives MCP from VS Code
here). Everything else the wizard ships is vendored.

That prune has to be **re-applied after each bump** — `argent init` restores the full wizard set,
including skills added since the last run. Prune the directory in `.agents/skills/`, its
`.claude/skills/` symlink, **and** its `skills-lock.json` entry; leaving the lock entry behind is
the failure mode that makes the set look tracked when it is not.

Three of the vendored skills are worth calling out, because what they are for is not obvious from
the name:

- **`argent-android-emulator-setup`** — the stack is iOS **and** Android (see `CLAUDE.md`), so the
  emulator is a first-class target. It was pruned while #79 kept us iOS-first; that no longer
  holds.
- **`argent-settings-permissions`** — the app asks for camera (`expo-camera`, the CafeOwner scan
  flow) and notifications (`expo-notifications`). This is the only way to pre-authorize, deny, or
  reset those without walking the system Settings UI — including re-enabling one the user already
  denied, which iOS never re-prompts for.
- **`argent-screen-recording`** — mp4 of a flow. The Mari loop judges stills and screenshot diffs,
  but motion is the thing a still cannot show: the scan-success moment and the Ворожка reveal
  (#67) are both animations.

### Argent flows vs the Maestro gallery

We now have two flow systems, so keep the seam sharp rather than letting them drift into the same
job (`docs/flows/README.md` owns the Maestro side):

| | Argent flows (`argent-create-flow`, `argent-qa-flows`) | Maestro (`apps/mobile/.maestro/`) |
| --- | --- | --- |
| Driven by | an agent, in-session | `capture.sh` / CI, headless |
| Good for | authoring and replaying a path while iterating; profiling A/B; regression evidence from acceptance criteria | the committed per-role screenshot gallery and E2E smoke suite |
| Lives in | `.argent/flows/` | `apps/mobile/.maestro/` |

Rule of thumb: if a human will re-run it on a schedule, it belongs in Maestro. If an agent needs to
walk the same path twice in one session, record an Argent flow. **Do not port the gallery flows to
Argent** — duplicated E2E is exactly the "state in two places" debt the product principles rule
out.

**Telemetry** is enabled (the wizard default; it excludes source code, paths, and tool inputs).
Opt out with `./node_modules/.bin/argent telemetry disable`.

## Running a session

Prerequisites on the machine: macOS + Xcode (simulators), Node per root `package.json`.

```sh
pnpm db:up          # local Postgres
pnpm dev:api        # API on :3000 (runs migrations first)
pnpm dev:mobile     # Metro; press i — or: cd apps/mobile && npx expo start --ios
```

Expo Go is enough for everything we do today (control, screenshots, component tree, React
profiler). Only **native** profiling needs a dev build.

Then just ask Claude — the `argent-*` skills route the rest:

> "Boot an iPhone simulator, open the app, go to the scan screen and screenshot it."

Tips learned wiring this up (2026-07-10):

- **Pre-grant the camera** so the scan screen skips the permission prompt:
  `xcrun simctl privacy booted grant camera host.exp.Exponent`
- Expo Go's first-launch dev-menu sheet covers the app; Claude dismisses it by tapping outside the
  sheet (top of the screen), not "Continue".
- Re-open the app deterministically with `open-url` → `exp://<lan-ip>:8081` (Metro prints it).
- **Demo fixtures**: `pnpm db:seed-demo` (idempotent, additive, local dev DB only) creates/restores
  the defined demo world — run it after any `db:reset`, or before a session to pin the state.
  `pnpm db:seed-demo-fresh` truncates the data tables first (clears accreted junk from past runs).
  The full roster + its rationale live in `apps/api/scripts/seed-world.ts`; password for all is
  `demo-password-1`. The two you reach most:
  - CafeOwner `demo.owner@kavtsya.test` — **Free** café «Кавярня «Демо»» (threshold 5, reward =
    безкоштовний напій); the Plan-gate pitch side.
  - Customer `demo.customer@kavtsya.test`, member code **`KAVA-2026`** (#21), balance one Зернятко
    short of the threshold — a single scan demos earn → redeem → Ворожка.
  - Also seeded: `pro.owner@` (Pro café + analytics history), `barista@` (rostered Barista),
    `new.owner@` / `new.customer@` (empty states) — see `seed-world.ts`.
- **Recorded flows** (`.argent/flows/`, replay with `flow-execute`): `customer-qr-screen` and
  `owner-to-scan-screen` walk from a fresh `open-url` to the respective screen — start every
  verification/design session by replaying one instead of re-deriving navigation. Prerequisites:
  stack running (`db:up` + `dev:api` + Metro), demo world seeded, simulator booted, the account
  named in the flow's `executionPrerequisite` signed in.

## The Mari design loop / Дизайн-цикл з Марі

**UA:** Марі, тепер можна дивитися на результат одразу, без ручного перезапуску застосунку.
Цикл такий: ти описуєш Клодові, що змінити на екрані (можна українською, як завжди) → Клод
редагує код → сам відкриває екран у симуляторі та надсилає скриншот → ти дивишся і кажеш, що
далі: «ще раз, але тепліший фон», «кнопку нижче», «покажи два варіанти». Якщо просиш кілька
варіантів — Клод може показати їх поруч (skill `argent-lens`) і ти просто обираєш. Нічого
встановлювати чи запускати не треба, крім самого застосунку — якщо він ще не запущений, Клод
запустить.

**EN summary:** Mari describes the change → Claude edits the screen → Claude opens it in the
simulator and posts a screenshot → Mari judges and iterates. `argent-lens` presents multiple
visual variants side-by-side for her to pick; `argent-screenshot-diff` guards refactors with
before/after comparisons. The scan-success moment and the Ворожка reveal (#67) are the screens
this loop is for.

## Updating Argent

Pre-1.0: pin exact, bump deliberately.

```sh
pnpm add -D -w -E @swmansion/argent@<version>
./node_modules/.bin/argent init --local   # refreshes skills/rules; re-prune, check skills-lock.json
```

**`argent init --local` is not optional.** The 0.15 → 0.16 bump (#104) changed only
`package.json` + the lockfile, so the vendored skills and `skills-lock.json` stayed pinned at
`v0.15.0` while the package ran 0.16 — four months of silent drift, caught only during the 0.20
bump. The package and the skills are one unit; move them together or the lockfile is lying.

After `init`, check the diff for all four surfaces it rewrites: `.agents/skills/argent-*`,
`.claude/skills/` symlinks, `skills-lock.json`, and `.claude/rules/argent.md` (the always-on rule
is regenerated, so tool-contract changes land there — e.g. 0.20 made
`stop-all-simulator-servers` take an explicit `devices: [...]` list, because one tool-server is
now shared across agents and an unscoped call tears down other sessions' devices). `init` also
rewrites `.mcp.json` unformatted; `pnpm format` puts it back.

Bumping within 24h of an npm release trips pnpm 11's `minimumReleaseAge` quarantine — same trap
as the Expo track, and the same fix. See `docs/agents/dependency-updates.md`.
