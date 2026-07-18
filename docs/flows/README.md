# User flows

Visual, **self-maintaining** documentation of how each Role Mode moves through
the app — from sign-up to core usage. Two layers, both regenerated from the code
rather than hand-drawn, so they can't quietly drift out of date.

| Layer | Artifact | Answers | Source of truth |
| --- | --- | --- | --- |
| **1 — Map** | [`maps.md`](maps.md) (Mermaid, committed) | *What screens exist and how do you move between them?* | The Expo Router tree + real navigation call-sites |
| **2 — Gallery** | `shots/<role>/…` (PNG, git-ignored) | *What does each step actually look like, per role?* | Maestro flows replayed on a dev build + seeded demo world |

The three Role Modes (Customer, CafeOwner, Scanner) are the surfaces `index`
dispatches to from live account facts — active Зміна → Scanner, else a CafeOwner
→ CafeOwner, else Customer (ADR 0015).

## Layer 1 — the map (zero-maintenance)

```sh
pnpm --filter @kavtsya/mobile flows:map
```

`apps/mobile/scripts/gen-flow-map.mjs` walks `apps/mobile/src/app`, reads the
`router.push/replace` + `<Link>` call-sites for edges, folds in the auth guard
and the Mode dispatch, and rewrites `maps.md` (one diagram per role + a combined
map). GitHub renders the Mermaid inline. Add a route or change navigation, re-run,
commit the diff — the map follows the code. Covered by
`apps/mobile/test/gen-flow-map.test.ts`.

## Layer 2 — the gallery (deterministic screenshots)

Maestro flows in [`apps/mobile/.maestro/`](../../apps/mobile/.maestro/) drive the
real app and screenshot each step. They double as E2E smoke tests, so one
artifact serves both jobs. Each numbered flow is a role lens; `subflows/` holds
the reusable reset + sign-in steps.

**One-time setup**

```sh
curl -Ls https://get.maestro.mobile.dev | bash   # installs Maestro (needs a JDK)
```

**Each capture**

```sh
pnpm db:up && pnpm db:seed-demo    # seeded demo world (seed-world.ts)
pnpm dev:api && pnpm dev:mobile    # stack + Metro
# …with a dev build booted on the simulator, then:
apps/mobile/.maestro/capture.sh
```

`capture.sh` defaults `APP_ID` to `com.kavtsya.app` (`app.json` →
`expo.ios.bundleIdentifier`); override with `APP_ID=… apps/mobile/.maestro/capture.sh`
if you build under a different id.

Flows sign in as the seeded accounts (universal password `demo-password-1`):
`demo.customer@kavtsya.test` (Customer), `demo.owner@kavtsya.test` (CafeOwner),
`barista@kavtsya.test` (Scanner). Screenshots land in `shots/<role>/` — git-ignored
because they're a regenerable local artifact; the committed map is the durable
reference.

### `APP_ID`

Pinned in `app.json` (`expo.ios.bundleIdentifier` / `android.package` =
`com.kavtsya.app`) and used as the `capture.sh` default. It must be the dev-client
bundle id, not `host.exp.Exponent` — `clearState` against Expo Go would wipe Expo
Go itself. Verify the installed id still matches before a release capture:

```sh
xcrun simctl listapps booted | grep -i kavtsya    # or: grep CFBundleIdentifier
```

### Known follow-ups (fill on the first live capture)

- **Owner sub-screens** — `30-owner.yaml` screenshots the home + scan; the
  analytics/campaigns/roster/shifts/café-program labels get added once read off
  the running screen (Argent `describe`).
- **Scanner** — `50-scanner.yaml` needs an *active* Зміна for the barista first
  (owner starts one, or a direct API/seed call); run with `CAPTURE_SCANNER=1`.
- **Selector hardening** — adding `testID`s to the sign-in fields would make the
  flows robust against Ukrainian copy changes.
