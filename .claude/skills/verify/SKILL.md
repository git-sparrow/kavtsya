---
name: verify
description: Kavtsya project verify recipe — the static gate to run before any commit/PR, plus how to bring up the stack and drive the API (curl) and the mobile app (Argent/iOS simulator) to observe a change working end-to-end.
---

# Verify a change in Kavtsya

Two distinct layers. The static gate is CI-parity and runs on every slice before
commit; runtime verification drives the actual surface the diff touches.

## 1. Static gate (always, before commit/PR)

```sh
pnpm typecheck && pnpm lint && pnpm test
```

All three are root scripts (`typecheck`/`test` fan out with `pnpm -r`; `lint` is
one repo-wide eslint). Same checks as `.github/workflows/ci.yml`. Green gate ≠
verified — go drive the surface next.

## 2. Bring up the stack

```sh
pnpm db:up          # local Postgres (docker compose)
pnpm db:seed-demo   # idempotent demo world (safe to re-run; see below)
pnpm dev:api        # API on :3000 — runs migrations first (predev)
pnpm dev:mobile     # Metro on :8081 (only needed for mobile surfaces)
```

Demo world (created/restored by `db:seed-demo`, run it after any `db:reset`):

- CafeOwner `demo.owner@kavtsya.test` / `demo-password-1` — owns «Кавярня
  «Демо»» (threshold 5, reward = безкоштовний напій)
- Customer `demo.customer@kavtsya.test` / `demo-password-1`, member code
  `KAVA-2026`, balance seeded one Зернятко short of the threshold — a single
  scan demos earn → redeem → Ворожка.

## 3. API surface (curl on :3000)

Better Auth owns `/api/auth/*`. Sign in, capture the cookie, hit the endpoint:

```sh
curl -si http://localhost:3000/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"demo.customer@kavtsya.test","password":"demo-password-1"}' \
  | grep -i '^set-cookie'
# then: curl -s http://localhost:3000/api/me/balances -H "cookie: <that cookie>"
```

(`/api/auth/sign-up/email` for a throwaway account — same shape, plus `name`.)

## 4. Mobile surface (Argent, iOS simulator)

Argent MCP tools are the only sanctioned way to drive the simulator
(`.claude/rules/argent.md`). Expo Go is enough for everything but native
profiling. Full setup notes: `docs/argent-howto.md`.

- **Start from a recorded flow**, not hand-derived navigation. `flow-execute`
  with `.argent/flows/customer-qr-screen.yaml` (Customer home / QR) or
  `owner-to-scan-screen.yaml` (CafeOwner Mode → scan screen). Check each flow's
  `executionPrerequisite` — it names which demo account must be signed in.
  The simulator udid is baked into the YAML; edit it if the booted device
  changes.
- Pre-grant the camera before any scan-screen work:
  `xcrun simctl privacy booted grant camera host.exp.Exponent`
- Reset navigation with `restart-app` (bundleId `host.exp.Exponent`) then
  `open-url` → `exp://127.0.0.1:8081` — `open-url` alone does NOT reset a warm
  app's navigation stack.
- Expo Go's first-connect dev-menu sheet can cover the app: dismiss by tapping
  near the top of the screen (outside the sheet), not "Continue".

## Gotchas

- `mcp__argent__*` tools only load after a session restart following
  `pnpm install`.
- `pnpm db:reset` wipes the volume — re-run `db:seed-demo` after.
- API dates cross the wire as strings (PR #86): `apiFetch` deliberately
  overrides Better Auth's Date-reviving parser — don't "fix" string dates you
  see in responses.
