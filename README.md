# Kavtsya (Кавця) ☕

A multi-café coffee loyalty app for the Ukrainian market. Each Café runs its own
independent loyalty program: Customers collect **Зернятка** (one per Purchase)
and redeem **Rewards** at the Cafés where they buy coffee; **CafeOwners** run
their program, scan Customer QR codes, and get growth tools. Signature feature:
an AI "coffee fortune" (**Ворожка**), tied to the Ukrainian tradition of
fortune-telling by coffee grounds.

> **Where to look for what**
> Scope, decisions, and naming live in [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md).
> The domain glossary is in [`CONTEXT.md`](CONTEXT.md), and architecture
> decisions in [`docs/adr/`](docs/adr/). Guidance for AI sessions is in
> [`CLAUDE.md`](CLAUDE.md). **This README covers how to run the code.**

## 📖 Domain in one minute

The terms below are used verbatim in the UI, the code, and these docs — see
[`CONTEXT.md`](CONTEXT.md) for the full glossary.

| Term            | Meaning                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Зернятко**    | The loyalty unit ("little bean"). One per Purchase; balances are **per-Café**, never pooled. |
| **Purchase**    | A Customer buying at a Café — recorded when the CafeOwner scans their QR. Adds one Зернятко. |
| **Reward**      | What a Customer redeems once their balance reaches the Café's threshold (default 10).         |
| **Redemption**  | Claiming a Reward. Balance **subtracts the threshold** (does not reset), so surplus carries. |
| **Customer**    | A person collecting Зернятка. Always free.                                                    |
| **CafeOwner**   | Кавовар — operates a Café. Also a Customer: one account, CafeOwner Mode unlocked on top.      |
| **Ворожка**     | The post-Purchase AI coffee fortune. In v1, a daily batch of generic fortunes served randomly. |
| **Plan**        | A CafeOwner's tier — **Free** (full core loyalty loop) or **Pro** (push + analytics).        |

## 🗂️ Monorepo layout

```
apps/api          Hono API on Node.js — postgres.js, raw SQL (no ORM), Zod, Better Auth
apps/mobile       React Native + Expo app (single app, CafeOwner Mode)
packages/shared   Types + Zod schemas shared by api and mobile
docker/           Local Postgres init scripts (creates kavtsya + kavtsya_test)
docs/adr/         Architecture decision records
```

## 🚧 Build status

The core loyalty loop is wired end to end. Built and merged so far:

- **Auth** — email/password sessions via Better Auth (`/api/auth/*`); Google &
  Apple Sign-In deferred.
- **Cafés** — registration + the owner↔Café ownership link. The CafeOwner role
  is *derived* from ownership (ADR 0003).
- **Loyalty config** — per-Café threshold + Reward, plus a Platform-tunable
  `platform_config` key/value store.
- **Rotating QR token** — signed, single-use-for-earning Customer token that
  rotates ~60s (ADR 0006).
- **Core scan** — the append-only Зернятко ledger with a *derived* balance and a
  self-farming guard (ADR 0010).

Not yet built: Redemption confirm flow, Ворожка (AI fortunes), push campaigns,
and analytics. See [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) for the roadmap.

## ✅ Prerequisites

- **Node.js 24+** — `.nvmrc` pins 24 (`nvm use`)
- **pnpm** — `npm i -g pnpm` or `brew install pnpm`
- **Docker Desktop** — for the local Postgres used by dev and tests
- For mobile: the **Expo Go** app on a device, or an iOS Simulator / Android
  emulator

## ⚙️ Setup

```bash
pnpm install
cp .env.example .env
```

Then edit `.env` and set the two secrets — auth and QR scanning will not work
with the placeholder values. Both must be **≥32 characters** and distinct so
they can be rotated independently:

```bash
openssl rand -base64 32   # → BETTER_AUTH_SECRET
openssl rand -base64 32   # → QR_TOKEN_SECRET
```

Bring up the database and apply migrations:

```bash
pnpm db:up                # start local Postgres (creates kavtsya + kavtsya_test)
pnpm migrate              # apply migrations to the dev database
```

> `pnpm dev:api` also runs `migrate` automatically before starting (its
> `predev` hook), so the explicit `pnpm migrate` above is only needed the first
> time or when you want to apply migrations without booting the server.

## ▶️ Run

```bash
pnpm dev:api              # API on http://localhost:3000  → GET /health
pnpm dev:mobile           # Expo dev server; open in Expo Go / a simulator
```

The mobile app opens on a sign-in screen; after authenticating you land in the
Customer experience, with CafeOwner Mode (including the QR scanner) available to
accounts that own a Café.

Point the app at the API with `EXPO_PUBLIC_API_URL`:

| Target                  | Value                     |
| ----------------------- | ------------------------- |
| iOS Simulator           | `http://localhost:3000`   |
| Android emulator        | `http://10.0.2.2:3000`    |
| Physical device (Expo Go) | `http://<your-LAN-IP>:3000` |

## 🔌 API surface

The Hono app composes one router per slice (see `apps/api/src/routes/`):

| Method & path                | What it does                                              |
| ---------------------------- | -------------------------------------------------------- |
| `GET /health`                | Liveness + DB reachability check                         |
| `* /api/auth/*`              | Signup / login / logout / session (owned by Better Auth) |
| `GET /api/me`                | The current authenticated Customer                       |
| `GET /api/me/balances`       | The Customer's Зернятко balance per Café (derived)       |
| `POST /api/cafes`            | Register a Café (makes the account a CafeOwner)          |
| `GET /api/cafes/:id/program` | Read a Café's threshold + Reward configuration           |
| `PUT /api/cafes/:id/program` | Update a Café's threshold + Reward configuration         |
| `GET /api/reward-defaults`   | The Platform-default Reward set                          |
| `GET /api/qr-token`          | Issue the Customer's rotating signed QR token            |
| `POST /api/purchases`        | Scan → append a Зернятко to the ledger (self-farm guarded) |

## 🧪 Test

The API has a **real-Postgres integration harness** — no mocking, since the
database is the primary test seam (ADR 0005). It runs against the
`kavtsya_test` database created by `pnpm db:up`, using a frozen clock and an
injected app factory (`apps/api/test/helpers/`).

```bash
pnpm db:up                        # ensure Postgres is running
pnpm test                         # run all workspace tests
pnpm --filter @kavtsya/api test   # just the API suite
```

## 📜 Scripts (run from the repo root)

| Command             | Does                                                    |
| ------------------- | ------------------------------------------------------- |
| `pnpm dev:api`      | Run the API (auto-migrates first) with watch reload     |
| `pnpm dev:mobile`   | Start the Expo dev server                               |
| `pnpm db:up`        | Start local Postgres (detached)                         |
| `pnpm db:down`      | Stop Postgres                                           |
| `pnpm db:reset`     | Drop the volume and recreate a fresh Postgres           |
| `pnpm migrate`      | Apply pending migrations to the dev database            |
| `pnpm test`         | Run tests across all workspaces                         |
| `pnpm typecheck`    | Type-check all workspaces                               |
| `pnpm lint`         | ESLint across the repo (`lint:fix` to autofix)          |
| `pnpm format`       | Prettier write (`format:check` to verify only)          |

Formatting and linting also run on staged files via a Husky pre-commit hook
(lint-staged).

## 🏛️ Architecture decisions

Every significant choice is recorded as a short ADR in
[`docs/adr/`](docs/adr/):

| ADR  | Decision                                                        |
| ---- | -------------------------------------------------------------- |
| 0001 | Per-café loyalty — Зернятка do not pool across Cafés           |
| 0002 | One app, two modes — not separate Customer / CafeOwner apps    |
| 0003 | CafeOwner accounts are also Customer accounts                  |
| 0004 | Hono on Node.js (Railway) over a BaaS                          |
| 0005 | Raw SQL over an ORM (postgres.js)                              |
| 0006 | Dynamic QR code — rotating signed, single-use token           |
| 0007 | Custom AI provider abstraction over the Vercel AI SDK          |
| 0008 | Monorepo — single repo for mobile app and API                 |
| 0009 | Зернятко issuance is independent of Ворожка                    |
| 0010 | Зернятко balance is a derived event ledger, not a counter     |
| 0011 | Freemium monetization: feature-gated, "no POS" is the wedge   |
| 0012 | POS integration is an optional edge adapter, never a dependency |

## 🌿 Branch strategy

This repo follows **GitHub Flow**:

- `main` is always deployable.
- Each unit of work (typically one issue / vertical slice) gets a short-lived
  branch: `feat/<issue#>-<slug>`, `fix/<issue#>-<slug>`, or `chore/<slug>`.
- Open a **pull request** into `main`; review, then **squash-merge**.
- Delete the branch after merge. Keep branches short-lived to minimise drift.

Commits reference their issue (e.g. `#20`). One slice is built and reviewed at a
time before merging.
