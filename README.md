# Kavtsya (Кавця) ☕

A multi-café coffee loyalty platform for the Ukrainian market, designed and built solo.
Customers collect **Зернятка** ("little beans" — one per Purchase) and redeem **Rewards**
at the Cafés where they buy coffee; **CafeOwners** run their own independent programme,
scan Customer QR codes, manage a barista roster and get growth tools. Signature feature:
an AI coffee fortune (**Ворожка**), tied to the Ukrainian tradition of fortune-telling by
coffee grounds.

React Native + Expo · Hono on Node.js · PostgreSQL with raw SQL · Anthropic Claude

> **Where to look for what**
> Scope, roadmap and **current status** live in [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) —
> that file is their single home, so nothing here restates them. The domain glossary is
> in [`CONTEXT.md`](CONTEXT.md), architecture decisions in [`docs/adr/`](docs/adr/), and
> guidance for AI sessions in [`CLAUDE.md`](CLAUDE.md).
> **This README covers what the project is and how to run it.**

---

## Why this repo might interest you

It's a complete product rather than a demo — auth, a role-based surface per Mode, an
append-only loyalty ledger, an AI feature, CI, and end-to-end tests — but the part worth
reading is **[`docs/adr/`](docs/adr/)**. Sixteen architecture decision records record what
was considered, what was rejected, and why. A few that stand on their own:

| ADR | The decision, and why it was interesting |
| --- | --- |
| [0010](docs/adr/0010-event-ledger-balance-derived.md) | Balances are a **derived append-only event ledger**, not a mutable counter — because "subtract the threshold" on a counter is a read-modify-write that double-fires under concurrency, and because analytics and churn prediction need the history a counter throws away. |
| [0006](docs/adr/0006-dynamic-qr-code.md) | The Customer QR is a **rotating signed token, single-use for earning** via a `unique (qr_jti)` constraint — so the consumed-token check and the Зернятко issuance are the same write. With a cached static member code as an offline fallback, because Ukrainian cafés lose power and signal. |
| [0013](docs/adr/0013-staff-scanner-grants-shift.md) | Baristas scan through a **café-scoped roster plus a per-shift grant on their own account** — never a shared login. Security rests on roster membership, not on the printed poster, so a leaked photo grants nothing. |
| [0009](docs/adr/0009-bean-issuance-independent-of-vorozhka.md) | The AI fortune is generated as a **scheduled daily batch**, never on the request path — so a loyalty guarantee can never depend on a third party's uptime. |
| [0016](docs/adr/0016-hand-rolled-data-fetching.md) | **No query library.** Written after measuring the bundle cost and reading TanStack's own React Native docs, which confirm focus refetching stays manual there — so the library would have removed less than it added. |

There is also a written rule for AI-assisted work in
[`docs/agents/llms-resources.md`](docs/agents/llms-resources.md): never state a version,
third-party API, or tooling behaviour from memory — check it, and record how and when you
checked it, inline. It exists because unchecked confidence is the actual failure mode.

---

## 📖 Domain in one minute

Terms below are used verbatim in the UI, the code and the docs — see
[`CONTEXT.md`](CONTEXT.md) for the full glossary.

| Term | Meaning |
| --- | --- |
| **Зернятко** | The loyalty unit. One per Purchase; balances are **per-Café**, never pooled. |
| **Purchase** | A Customer buying at a Café — recorded when the CafeOwner or a barista scans their QR. |
| **Reward** | What a Customer redeems once their balance reaches the Café's threshold (default 10). |
| **Redemption** | Claiming a Reward. Balance **subtracts the threshold** (does not reset), so surplus carries over. |
| **Customer** | A person collecting Зернятка. Always free. |
| **CafeOwner** | Кавовар — operates a Café. Also a Customer: one account, CafeOwner Mode on top. |
| **Shift** | Зміна — one working session of Scanner Mode, started by scanning the Café's wall poster. |
| **Ворожка** | The post-Purchase AI coffee fortune. A daily batch of fortunes served at random. |
| **Plan** | A CafeOwner's tier — **Free** (full core loyalty loop) or **Pro** (push + analytics). |

## 🗂️ Monorepo layout

```
apps/api          Hono API on Node.js — postgres.js, raw SQL (no ORM), Zod, Better Auth
apps/mobile       React Native + Expo app (single app, three role-derived Modes)
packages/shared   Types + Zod schemas shared by api and mobile
docker/           Local Postgres init scripts (creates kavtsya + kavtsya_test)
docs/adr/         Architecture decision records
docs/flows/       Generated route map + Maestro screenshot gallery
```

The API composes one router per slice in `apps/api/src/routes/`; `GET /health` is the
liveness + DB reachability check.

## ✅ Prerequisites

- **Node.js 24+** — `.nvmrc` pins 24 (`nvm use`)
- **pnpm** — `npm i -g pnpm` or `brew install pnpm`
- **Docker Desktop** — for the local Postgres used by dev and tests
- For mobile: an iOS Simulator or Android emulator (or a device) and a **standalone dev
  build** — see the Run section below. Expo Go cannot open this project: it moved to Expo SDK 57,
  and Expo Go is a client for one SDK major only ([#221](https://github.com/git-sparrow/kavtsya/issues/221)).

## ⚙️ Setup

```bash
pnpm install
cp .env.example .env
```

Set the two secrets — auth and QR scanning will not work with placeholders. Both must be
**≥32 characters** and distinct so they can be rotated independently:

```bash
openssl rand -base64 32   # → BETTER_AUTH_SECRET
openssl rand -base64 32   # → QR_TOKEN_SECRET
```

`ANTHROPIC_API_KEY` is optional and used **only** by the daily Ворожка batch and its
smoke script — the API server never calls the model (ADR 0009) and boots fine without it.

```bash
pnpm db:up                # local Postgres (creates kavtsya + kavtsya_test)
pnpm migrate              # apply migrations
```

`pnpm dev:api` runs `migrate` itself via its `predev` hook, so the explicit call above is
only needed the first time, or to migrate without booting the server.

## ▶️ Run

```bash
pnpm dev:api                        # API on http://localhost:3000 → GET /health
pnpm dev:mobile                     # Expo dev server (Metro)
pnpm --filter @kavtsya/mobile ios   # build + install the dev build (com.kavtsya.app)
```

The dev build is a one-time native build per simulator (`android` for the emulator);
after that, Metro serves the JS and day-to-day work needs only the two `dev:` commands.
`ios/` and `android/` are Expo CNG output — regenerated by prebuild and git-ignored.

**Leave `EXPO_PUBLIC_API_URL` unset locally.** The app derives the API host from the
Metro server that bundled it (`apps/mobile/src/lib/auth-client.ts`), which resolves
correctly on a simulator, an emulator and a physical device without a hand-edited IP —
and survives DHCP moving your machine. Set it only to point at an API that is *not* on
the Metro host (a deployed environment or a tunnel); a stale value there is the first
thing to suspect when a device can't reach the API.

For a populated app, seed the demo world:

```bash
pnpm db:seed-demo         # demo Café, Customer, CafeOwner and barista accounts
```

The app opens on sign-in; after authenticating you land in the Mode derived from your
account — Scanner during an active Shift, else CafeOwner if you own a Café, else
Customer (ADR 0015).

## 🧪 Test

The API has a **real-Postgres integration harness** — no mocking, since the database is
the primary test seam ([ADR 0005](docs/adr/0005-raw-sql-no-orm.md)). It runs against the
`kavtsya_test` database with a frozen clock and an injected app factory
(`apps/api/test/helpers/`).

```bash
pnpm db:up
pnpm verify                       # typecheck + lint + format:check + full test suite
pnpm --filter @kavtsya/api test   # just the API suite
```

`pnpm verify` is the same gate CI runs and the one to run before pushing — see
[`CONTRIBUTING.md`](CONTRIBUTING.md). The Maestro flows in `apps/mobile/.maestro/` double
as E2E smoke tests; [`docs/flows/README.md`](docs/flows/README.md) covers running them.

## 📜 Scripts (run from the repo root)

| Command | Does |
| --- | --- |
| `pnpm dev:api` | Run the API (auto-migrates first) with watch reload |
| `pnpm dev:mobile` | Start the Expo dev server |
| `pnpm db:up` / `db:down` | Start / stop local Postgres |
| `pnpm db:reset` | Drop the volume and recreate a fresh Postgres |
| `pnpm db:seed-demo` | Seed the demo world (`db:seed-demo-fresh` resets first) |
| `pnpm migrate` | Apply pending migrations to the dev database |
| `pnpm verify` | The full gate: typecheck + lint + format:check + tests |
| `pnpm test` / `typecheck` / `lint` / `format` | The individual steps (`lint:fix`, `format:check`) |

Formatting and linting also run on staged files via a Husky pre-commit hook, and a
pre-push hook refuses direct pushes to `main`.

## 🏛️ Architecture decisions

Every significant choice is a short ADR in [`docs/adr/`](docs/adr/). ★ marks the five
covered above.

| ADR | Decision |
| --- | --- |
| [0001](docs/adr/0001-per-cafe-loyalty-not-pooled.md) | Per-café loyalty — Зернятка do not pool across Cafés |
| [0002](docs/adr/0002-one-app-two-modes.md) | One app, two modes — not separate Customer / CafeOwner apps |
| [0003](docs/adr/0003-owner-is-also-customer.md) | CafeOwner accounts are also Customer accounts |
| [0004](docs/adr/0004-hono-nodejs-railway-over-baas.md) | Hono on Node.js (Railway) over a BaaS |
| [0005](docs/adr/0005-raw-sql-no-orm.md) | Raw SQL over an ORM (postgres.js) |
| ★ [0006](docs/adr/0006-dynamic-qr-code.md) | Dynamic QR code — rotating signed, single-use token |
| [0007](docs/adr/0007-custom-ai-provider-abstraction.md) | Custom AI provider abstraction over the Vercel AI SDK |
| [0008](docs/adr/0008-monorepo.md) | Monorepo — single repo for mobile app and API |
| ★ [0009](docs/adr/0009-bean-issuance-independent-of-vorozhka.md) | Зернятко issuance is independent of Ворожка |
| ★ [0010](docs/adr/0010-event-ledger-balance-derived.md) | Balance is a derived event ledger, not a counter |
| [0011](docs/adr/0011-freemium-monetization-model.md) | Freemium: feature-gated, "no POS" is the wedge |
| [0012](docs/adr/0012-pos-integration-optional-adapter.md) | POS integration is an optional edge adapter, never a dependency |
| ★ [0013](docs/adr/0013-staff-scanner-grants-shift.md) | Staff scan access via a café-scoped Barista Roster + Shift |
| [0014](docs/adr/0014-account-deletion-anonymize-not-cascade.md) | Account deletion anonymizes; the ledger is never rewritten |
| [0015](docs/adr/0015-role-modes-derived-landing.md) | Role Modes: derived landing, precedence, owner-primary |
| ★ [0016](docs/adr/0016-hand-rolled-data-fetching.md) | One hand-rolled data-fetching hook, not a query library |

## 🌿 Contributing

Everything lands via a pull request onto `main` — branch naming, the `pnpm verify` gate
and commit style are in [`CONTRIBUTING.md`](CONTRIBUTING.md). Guidance for AI sessions is
in [`CLAUDE.md`](CLAUDE.md).
