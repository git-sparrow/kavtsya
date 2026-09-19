---
name: verify
description: Kavtsya project verify recipe — the static gate to run before any commit/PR, plus how to bring up the stack and drive the API (curl) and the mobile app (Argent/iOS simulator) to observe a change working end-to-end.
---

# Verify a change in Kavtsya

Two distinct layers. The local gate runs on every slice before
commit; runtime verification drives the actual surface the diff touches.

## 1. Static gate (always, before commit/PR)

```sh
pnpm verify
```

One root script = `agents:check && typecheck && lint && format:check && test`
(`typecheck`/`test` fan out with `pnpm -r`; `lint` is one repo-wide eslint) —
also run in `.github/workflows/ci.yml`. CI additionally runs Expo Doctor. Green
gate ≠ verified — exercise the changed surface next. For agent setup changes,
that means configuration/skill discovery, not an unrelated simulator run.

**Read the gate's own exit code.** Run it directly and inspect the tool's exit
code; do not infer success from the last line of a piped log.

Before tests, follow `docs/agents/workflow.md`: use a task-owned
`TEST_DATABASE_URL` or serialize runs against the shared test database. A second
agent must not reset that database or run its suite concurrently.

## 2. Bring up the stack

```sh
pnpm db:up             # local Postgres (docker compose)
pnpm db:seed-demo      # idempotent demo world (additive; safe to re-run mid-demo)
# pnpm db:seed-demo-fresh   # wipe data tables then reseed — clears accreted junk
pnpm dev:api           # API on :3000 — runs migrations first (predev)
pnpm dev:mobile        # Metro on :8081 (only needed for mobile surfaces)
```

Demo world — one defined, idempotent roster (source of truth: `apps/api/scripts/seed-world.ts`).
Every account's password is `demo-password-1`; the email encodes its single purpose.
`db:seed-demo` is additive (safe mid-demo); `db:seed-demo-fresh` truncates first for a
clean slate; run either after a `db:reset`.

Core loop (kept pristine):

- CafeOwner `demo.owner@kavtsya.test` — **Free** café «Кавярня «Демо»» (threshold 5,
  reward = безкоштовний напій). The Plan-gate **pitch** side (analytics/campaigns → `pro_required`).
- Customer `demo.customer@kavtsya.test`, member code `KAVA-2026`, balance one Зернятко
  short of the threshold — a single scan demos earn → redeem → Ворожка.

Roles & states:

- CafeOwner `pro.owner@kavtsya.test` — **Pro** café «Кавярня «Про»» with seeded backdated
  analytics history (busiest hour ~19:00). The **unlocked** side of every Plan gate.
- Customer `barista@kavtsya.test`, code `BRST-2026` — a `rostered` Barista at «Кавярня «Про»»
  (Зміна scanner grants #80 / roster #97).
- CafeOwner `new.owner@kavtsya.test` — no café (register-café / empty owner state).
- Customer `new.customer@kavtsya.test`, code `NEWC-2026` — no зернята (empty customer state).

The Pro café's history is carried by login-less synthetic customers (`hist-*`) — ledger
fk targets only, never signed into.

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

Read `.claude/rules/argent.md` (the shared Argent rules), then the relevant
setup and UI skills. Use Argent MCP tools for discovery, navigation, screenshots
and permissions. Do not copy simulator IDs or assume another session's app mode.

- Coordinate device and Metro ownership before interacting; see
  `docs/agents/workflow.md`.
- Use the standalone dev-build workflow documented in `docs/flows/README.md`
  for the Maestro gallery/E2E flows; inspect `docs/argent-howto.md` and the flow's
  prerequisites for other runtime checks.
- Prefer an existing recorded flow when it matches the acceptance criteria;
  verify its account, app and device prerequisites before replay.
- For camera access, use `argent-settings-permissions` as directed by that skill.
- Capture the actual behavior and report the build, device, account role and
  flow/check used. Static checks are not UI evidence.

## Gotchas

- If Argent tools are missing, check the client-specific setup in
  `docs/agents/workflow.md`; do not treat a config file as proof of a connection.
- `pnpm db:reset` wipes the volume — re-run `db:seed-demo` after.
- API dates cross the wire as strings (PR #86): `apiFetch` deliberately
  overrides Better Auth's Date-reviving parser — don't "fix" string dates you
  see in responses.
