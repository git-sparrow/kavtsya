# Kavtsya (Кавця)

A multi-café coffee loyalty mobile app for the Ukrainian market. Customers
collect **Зернятка** (one per Purchase) and redeem **Rewards** at the Cafés
where they buy coffee; **CafeOwners** run their own loyalty program, scan
Customer QR codes, and get growth tools. Signature feature: an AI "coffee
fortune" (**Ворожка**).

> Scope, decisions, and naming live in [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md),
> the domain glossary in [`CONTEXT.md`](CONTEXT.md), and architecture decisions
> in [`docs/adr/`](docs/adr/). This README covers how to run the code.

## Monorepo layout

```
apps/api        Hono API on Node.js (postgres.js, raw SQL, no ORM)
apps/mobile     React Native + Expo app (single app, CafeOwner Mode)
packages/shared Types + Zod schemas shared by api and mobile
docker/         Local Postgres init scripts
```

## Prerequisites

- **Node.js 24+** (`.nvmrc` pins 24)
- **pnpm** (`npm i -g pnpm` or `brew install pnpm`)
- **Docker Desktop** — for the local Postgres used by dev and tests
- For mobile: the **Expo Go** app on a device, or an iOS Simulator / Android
  emulator

## Setup

```bash
pnpm install
cp .env.example .env          # adjust if needed
pnpm db:up                    # start local Postgres (creates kavtsya + kavtsya_test)
pnpm migrate                  # apply migrations to the dev database
```

## Run

```bash
pnpm dev:api                  # API on http://localhost:3000  → GET /health
pnpm dev:mobile               # Expo dev server; open in Expo Go / a simulator
```

The mobile shell fetches `/health` and renders the result, proving the
client → API → DB path. Point the app at the API with `EXPO_PUBLIC_API_URL`
(iOS simulator: `localhost`; Android emulator: `10.0.2.2`; physical device:
your machine's LAN IP).

## Test

The API has a real-Postgres integration harness (no mocking — the primary test
seam). It runs against the `kavtsya_test` database created by `pnpm db:up`.

```bash
pnpm db:up                    # ensure Postgres is running
pnpm test                     # run all workspace tests
pnpm --filter @kavtsya/api test
```

## Useful scripts (root)

| Command           | Does                                              |
| ----------------- | ------------------------------------------------- |
| `pnpm db:up`      | Start local Postgres (detached)                   |
| `pnpm db:down`    | Stop Postgres                                     |
| `pnpm db:reset`   | Drop the volume and recreate a fresh Postgres     |
| `pnpm migrate`    | Apply pending migrations to the dev database      |
| `pnpm test`       | Run tests across all workspaces                   |
| `pnpm typecheck`  | Type-check all workspaces                         |

## Branch strategy

This repo follows **GitHub Flow**:

- `main` is always deployable.
- Each unit of work (typically one issue / vertical slice) gets a short-lived
  branch: `feat/<issue#>-<slug>`, `fix/<issue#>-<slug>`, or `chore/<slug>`.
- Open a **pull request** into `main`; review, then **squash-merge**.
- Delete the branch after merge. Keep branches short-lived to minimise drift.

Commits reference their issue (e.g. `#15`). One slice is built and reviewed at a
time before merging.

## Architecture

Key decisions are recorded as ADRs in [`docs/adr/`](docs/adr/) — monorepo
(0008), Hono on Node/Railway (0004), raw SQL with postgres.js (0005), the
derived event ledger (0010), and more.
