# Kavtsya (Кавця) — Coffee Loyalty App

Shared project instructions for Claude Code and Codex.

## What this is

A multi-café coffee loyalty mobile app for the Ukrainian market. Each Café runs its own loyalty program: Customers collect **Зернятка** (loyalty units; one per Purchase) and redeem **Rewards** at the Cafés where they buy coffee. **CafeOwners** (Кавовар) scan Customer QR codes, configure their program, send push notifications and read analytics. Signature feature: **Ворожка**, an AI "coffee fortune" in the Ukrainian tradition of reading coffee grounds.

Twin goals: learn AI hands-on, and refresh JS/TS/React/React Native fundamentals.

**Build phase**: scope and architecture are locked. Status (what's merged, what's next) lives only in the Status line + Roadmap of [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) (#118); when a slice lands, update it there.

## Stack (locked)

- **Mobile**: React Native + Expo (iOS + Android), one app with a CafeOwner Mode
- **Backend**: Hono on Node.js (Railway)
- **Database**: PostgreSQL on Railway, raw SQL via `postgres.js` (no ORM), Zod for validation
- **Auth**: Better Auth — email/password + Google + Apple Sign-In
- **AI**: custom provider abstraction, Claude (Sonnet 5) by default for Ukrainian quality (ADR 0007)
- **Push**: Expo Push Notifications
- **Repo**: monorepo — `apps/mobile` + `apps/api` + `packages/shared`

Rationale: the Tech stack table in `PROJECT_BRIEF.md` and `docs/adr/`.

## Working agreement

- **Deliver via PR; never commit to `main`.** Every change, agents' included, goes on a branch and merges through a GitHub PR; `.husky/pre-push` blocks direct pushes. Branch naming, the `pnpm verify` gate and commit style: `CONTRIBUTING.md`. Write the PR body with the `pr` skill (`mattpocock-skills:pr`), then the handoff from `docs/agents/workflow.md`. Reference an issue the PR leaves open as `Refs #N`: GitHub links any `close`/`fix`/`resolve #N` in the body as closing, even after "not".
- Name domain concepts in `GLOSSARY.md` terms: **Зернятко** where you might write stamp/point, **CafeOwner** for owner, **Purchase** for transaction.
- Keep it simple: no redundant functionality or documentation. Tasks state intended behavior; code and tests are the source of truth for implemented behavior. Reserve docs for durable decisions and procedures that cannot be inferred from them. Prefer clear names, types and tests over comments; keep comments for non-obvious contracts, constraints or reasons, never to restate code or issue history.
- Before starting, handing off, reviewing or working concurrently, read `docs/agents/workflow.md` (setup, handoff template, edit ownership). One active editor per checkout; run concurrent implementation in separate worktrees, and agree on test databases, dev servers and devices before using them.
- Before committing or opening a PR, run the shared `verify` skill.
- Code review, by any reviewer, applies `CODING_STANDARDS.md`.

## Product principles

The bar for every change. When these collide, resolve in priority order: **security & data integrity → logical consistency → UX → architectural elegance → speed**.

- **Simple** = fewest *concepts* the user must hold, not fewest screens. Prefer one obvious path over three configurable ones.
- **Role-aware** = each Mode shows only what that role needs, in that role's language — no role sees another's clutter or terminology (ADR 0015).
- **Considered** = nothing is left to chance: consistent spacing/typography; every interaction has *designed* loading, empty, error, and success states; and accessibility is treated as craft — state changes are announced, type scales, contrast and touch targets are generous.
- **Non-negotiable floor** (not trade-offs): authorization is enforced server-side and never trusts client-supplied role/ID/permission; the same action gives the same result everywhere (no contradicting special cases); no new architectural debt (no duplicated business logic, no state in two places, no bypassing layers); every interactive element is reachable and labelled for assistive technology (a control a screen-reader user can't operate or name is a defect, not a polish item).
- When UX collides with the floor, accept neither a weaker floor nor a silently worse UX — propose 2–3 designs that satisfy both, with trade-offs. Friction that protects the user is fine; friction that only saves the developer is not.

## Verify before claiming

**Check before you write** a library, version, third-party API, config file, project layout, import path or scaffold, size or benchmark figure, "X requires Y" claim, or how a tool you operate inside behaves (Claude Code or Codex settings/plugins/skills/hooks/MCP, git, docker, CI runners). Stale training data feels certain, so the trigger is what you are about to write, not how confident you feel. `npm view <pkg> version peerDependencies deprecated` costs two seconds; for version-specific docs, a vendored skill comes first, then the tool's `llms.txt`. Each checked claim carries its **receipt**: how and when you checked, inline.

- Choose the **latest stable version** the dependency's version authority allows (the Expo SDK, not npm `latest`, sets the Expo-governed surface). Any other choice needs a stated reason and the maintainer's approval before installing.
- Prefer *running* the thing over reading about it when the run is **hermetic**. A run that reads machine-global mutable state (`~/.claude`, `~/.codex`, global npm, docker volumes, registries, caches) is isolated or cleared first, and its receipt says so; otherwise it is an anecdote, not evidence. For a documented contract, read the doc first to learn which variables exist, then run to confirm.
- Label any unchecked claim **unverified**. In an issue, ADR or code comment an unlabelled one later reads as settled fact.

Full rule and confirmed `llms.txt` endpoints: `docs/agents/llms-resources.md`.

## Agent skills

Shared skills live in `.agents/skills/`. Matt Pocock's skills stay pinned and unmodified under `.agents/plugins/mattpocock-skills/`; to set up, invoke or update them, read `.agents/plugins/README.md` and `docs/agents/workflow.md`.

- **Scope, decisions, naming, roadmap**: `PROJECT_BRIEF.md`.
- **Issues** live in GitHub Issues at `git-sparrow/kavtsya`: `docs/agents/issue-tracker.md`. **Triage labels** (the default five): `docs/agents/triage-labels.md`.
- **Domain docs**: single-context, one `GLOSSARY.md` + `docs/adr/` at the repo root: `docs/agents/domain.md`.
- **Dependencies** (adding, bumping, catalog, Dependabot, Expo upgrades): `docs/agents/dependency-updates.md`. The Expo-governed native surface moves only on the deliberate Expo track, never by hand or by automation.
- **Mobile runtime or UI work** (driving the app in a simulator or emulator: tap, type, screenshot, record a flow, diff screens, design review): first read and follow `.claude/rules/argent.md` (shared Argent rules despite the Claude path), then the matching `argent-*` skill. Background and the Mari design-review loop: `docs/argent-howto.md`.
- **User flows, E2E, screenshot gallery** (Maestro, `apps/mobile/.maestro/`): `docs/flows/README.md`. Maestro is a global CLI outside the pnpm lockfile, so each machine installs it from there; captures run on a standalone dev build with `--no-dev` Metro, not Expo Go.
