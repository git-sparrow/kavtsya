# Kavtsya (Кавця) — Coffee Loyalty App

> Context for any Claude session working in this repo (desktop Cowork, Claude Code, or mobile Remote Control).

## Status

**Build phase** — scope and architecture are locked. See `PROJECT_BRIEF.md` for the full brief and decisions, `CONTEXT.md` for the domain glossary, and `docs/adr/` for architecture decisions. Next milestone: PRD → issues → build.

## What this is

A multi-café coffee loyalty mobile app for the Ukrainian market. Each Café runs its own independent loyalty program — Customers collect **Зернятка** (loyalty units; one per Purchase) and redeem **Rewards** at the Cafés where they buy coffee. **CafeOwners** (Кавовар) scan Customer QR codes, configure their program, send push notifications, and get analytics. Signature feature: an AI "coffee fortune" (**Ворожка**) tied to the Ukrainian tradition of fortune-telling by coffee grounds.

Twin goals: learn AI hands-on, and refresh JS/TS/React/React Native fundamentals.

## Stack (locked in)

- **Mobile**: React Native + Expo (iOS + Android), single app with CafeOwner Mode
- **Backend**: Hono on Node.js (Railway)
- **Database**: PostgreSQL on Railway, raw SQL via `postgres.js` (no ORM), Zod for validation
- **Auth**: Better Auth — email/password + Google + Apple Sign-In
- **AI**: custom provider abstraction, Claude (Haiku) by default
- **Push**: Expo Push Notifications
- **Repo**: monorepo — `apps/mobile` + `apps/api` + shared types

See the Tech stack table in `PROJECT_BRIEF.md` and `docs/adr/` for full rationale.

## Working agreement

- Use the domain glossary in `CONTEXT.md` consistently — **Зернятко** not "stamp/point", **CafeOwner** not "owner", **Purchase** not "transaction".
- Keep it simple: no redundant functionality.
- This repo enables `mp-core` + `mp-engineering` skills via `.claude/settings.json`. Run `/mp-engineering:setup-matt-pocock-skills` once before using the engineering workflow skills.

## Key files

- `PROJECT_BRIEF.md` — source of truth for scope, decisions, naming, roadmap.
- `CONTEXT.md` — domain glossary (Зернятко, CafeOwner, Ворожка, Purchase, Reward, Plan, …).
- `docs/adr/` — architecture decision records.
- `.claude/settings.json` — enabled skill plugins.

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `git-sparrow/kavtsya`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
