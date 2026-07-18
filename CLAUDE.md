# Kavtsya (Кавця) — Coffee Loyalty App

> Context for any Claude session working in this repo (desktop Cowork, Claude Code, or mobile Remote Control).

## Status

**Build phase** — scope and architecture are locked. Current status — what's merged and what's next — has exactly **one home**: the Status line + Roadmap in [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md). Don't restate it here or anywhere else (#118); update it there when a slice lands. See `CONTEXT.md` for the domain glossary and `docs/adr/` for architecture decisions.

## What this is

A multi-café coffee loyalty mobile app for the Ukrainian market. Each Café runs its own independent loyalty program — Customers collect **Зернятка** (loyalty units; one per Purchase) and redeem **Rewards** at the Cafés where they buy coffee. **CafeOwners** (Кавовар) scan Customer QR codes, configure their program, send push notifications, and get analytics. Signature feature: an AI "coffee fortune" (**Ворожка**) tied to the Ukrainian tradition of fortune-telling by coffee grounds.

Twin goals: learn AI hands-on, and refresh JS/TS/React/React Native fundamentals.

## Stack (locked in)

- **Mobile**: React Native + Expo (iOS + Android), single app with CafeOwner Mode
- **Backend**: Hono on Node.js (Railway)
- **Database**: PostgreSQL on Railway, raw SQL via `postgres.js` (no ORM), Zod for validation
- **Auth**: Better Auth — email/password + Google + Apple Sign-In
- **AI**: custom provider abstraction, Claude (Sonnet 5) by default — Ukrainian quality, see ADR 0007
- **Push**: Expo Push Notifications
- **Repo**: monorepo — `apps/mobile` + `apps/api` + shared types

See the Tech stack table in `PROJECT_BRIEF.md` and `docs/adr/` for full rationale.

## Working agreement

- Use the domain glossary in `CONTEXT.md` consistently — **Зернятко** not "stamp/point", **CafeOwner** not "owner", **Purchase** not "transaction".
- Keep it simple: no redundant functionality.
- Matt Pocock's workflow skills (tdd, to-spec, to-tickets, triage, domain-modeling, …) are vendored into this repo and committed, not installed globally — the real files live in `.agents/skills/`, with `.claude/skills/` symlinks pointing at them and `skills-lock.json` pinning the `mattpocock/skills` sources/hashes. They're standalone and un-namespaced (`/tdd`) and travel with the repo, so no per-machine global install is needed. Update them with `npx skills@latest` against `skills-lock.json`. `.claude/settings.json` additionally pins project-relevant plugins (currently the Expo skills).

## Product principles

The bar for every change. When these collide, resolve in priority order: **security & data integrity → logical consistency → UX → architectural elegance → speed**.

- **Simple** = fewest *concepts* the user must hold, not fewest screens. Prefer one obvious path over three configurable ones.
- **Role-aware** = each Mode shows only what that role needs, in that role's language — no role sees another's clutter or terminology (ADR 0015).
- **Considered** = nothing is left to chance: consistent spacing/typography; every interaction has *designed* loading, empty, error, and success states; and accessibility is treated as craft — state changes are announced, type scales, contrast and touch targets are generous.
- **Non-negotiable floor** (not trade-offs): authorization is enforced server-side and never trusts client-supplied role/ID/permission; the same action gives the same result everywhere (no contradicting special cases); no new architectural debt (no duplicated business logic, no state in two places, no bypassing layers); every interactive element is reachable and labelled for assistive technology (a control a screen-reader user can't operate or name is a defect, not a polish item).
- When UX collides with the floor, accept neither a weaker floor nor a silently worse UX — propose 2–3 designs that satisfy both, with trade-offs. Friction that protects the user is fine; friction that only saves the developer is not.

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

### Dependency updates

Layered version-authority model (lockfile / Expo SDK / pnpm catalog / owning app), the pnpm catalog, Dependabot config, and the deliberate Expo upgrade track. **Never hand-bump or automate the Expo-governed native surface.** See `docs/agents/dependency-updates.md`.

### Simulator control (Argent)

The `argent-*` skills + MCP server (Software Mansion's Argent, local devDependency) let Claude drive the app in the iOS simulator — tap, type, screenshot, record flows, diff screens. See `docs/argent-howto.md`, incl. the Mari design-review loop.

### User flows & E2E (Maestro)

`docs/flows/` — an auto-generated Mermaid route map (`pnpm --filter @kavtsya/mobile flows:map`) + a Maestro-driven per-role screenshot gallery (`apps/mobile/.maestro/`, `capture.sh`), captured on a **standalone dev build + `--no-dev` Metro** (not Expo Go; `ios/`+`android/` are git-ignored CNG output). **Maestro is a global CLI installed out-of-band (`curl -Ls https://get.maestro.mobile.dev | bash`; needs a JDK) — _not_ in the pnpm lockfile/catalog**, so a fresh checkout installs it separately. The YAML flows double as E2E/smoke tests; Maestro's MCP server can drive flow authoring/running from an agent — kept **on demand** (not loaded every session) via `apps/mobile/.maestro/mcp.sh enable|disable` (restart after). See `docs/flows/README.md`.

### LLM doc endpoints

For current, version-specific facts about a stack tool, fetch its `llms.txt` rather than relying on training memory (prefer a vendored skill where one exists). Confirmed endpoints + the index-vs-condensed rule live in `docs/agents/llms-resources.md`.
