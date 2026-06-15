# Kavtsya — Project Brief

_Last updated: 2026-06-15 · Status: **planning / exploration** (do not build yet)_

## Purpose

A pet project with two real goals:

1. **Learn AI** hands-on.
2. **Refresh engineering fundamentals** (JavaScript, TypeScript, React, React Native).

The coffee-shop loyalty app is the vehicle for both. Market: **Ukraine**.

## What it is

A mobile loyalty app connecting coffee shops with their Customers, plus a CafeOwner-facing side for scanning and outreach. Designed to be **simple — no redundant functionality**.

## Decisions locked in

| Area | Decision | Rationale |
|---|---|---|
| Stack | **React Native + Expo** (iOS + Android) | Reuses existing JS/TS/React strength; cross-platform; native Swift can come later |
| Backend | **Hono on Node.js (Railway)** | TypeScript-first, standard Node.js environment, no TCP restrictions; Railway hosts both the server and PostgreSQL in one place |
| Database | **PostgreSQL on Railway** + `postgres.js` driver + Zod | Plain SQL, no ORM; standard transferable skills; Zod validates all API inputs |
| Auth | **Email/password + Google + Apple Sign-In** via Better Auth | Email/password as baseline; Google/Apple for UX; Apple Sign-In required by App Store when any social login is offered |
| Customer QR | **Dynamic** — rotates every ~60s via signed token | Prevents QR screenshot sharing / stamp farming; app refreshes token from API |
| AI service | **Custom provider abstraction** — Claude (Haiku) by default | TypeScript interface + per-provider implementations; swap model/provider via env var; starts with Anthropic, no external AI SDK dependency |
| Repo structure | **Monorepo** — `apps/mobile` + `apps/api` | Shared TypeScript types between app and API; one repo to manage |
| AI | **Core focus**, not a gimmick | The base feature set is ~90% standard CRUD; AI must be deliberate to actually learn it |
| Scope | **Multi-café platform** | Many cafés + CafeOwners; each Café runs its own independent loyalty program — Зернятка do not pool across Cafés |

## Feature tiers

### MVP (v1)

**Customer**
- Login + unique QR code
- Collect Зернятка — one per Purchase, per Café (Зернятка do not pool across Cafés)
- Instant signup reward — 1–2 bonus Зернятка credited at the first Purchase
- Redeem Reward when Зернятко threshold is reached
- **Ворожка** — AI-generated coffee fortune after each Purchase

**CafeOwner**
- Scan Customer QR to issue a Зернятко
- Configure loyalty program: Зернятко threshold (configurable; default 10) + Reward (from platform defaults: free drink, free specific drink, fixed discount, % discount)
- Send push notifications (menu updates, seasonal products) — one-tap campaigns
- Basic analytics: peak hours, repeat vs new Customers

### v2 (planned, not v1)

- Churn alerts — AI-powered: "This regular hasn't visited in 3 weeks" (requires purchase history data to exist first)
- Discovery mode — map/list of nearby Kavtsya Cafés
- Streaks — visit cadence milestones for Customers

### Backlog (good idea, not yet scheduled)

- Shareable Ворожка card for social media _(needs value validation before building)_
- Seasonal / holiday Ворожка fortunes (Ukrainian holidays)
- Coffee personality profile — AI label based on order patterns
- Personalized push notifications based on order history
- CafeOwner: demand forecasting
- CafeOwner: custom Rewards (beyond platform defaults)

## Business model

Customers are always free. CafeOwners are the revenue source — freemium with a Paid Plan.

| Feature | Free | Paid |
|---|---|---|
| QR scan + Зернятка issuance | ✅ | ✅ |
| Reward + threshold configuration | ✅ | ✅ |
| Push notifications | ❌ | ✅ |
| Analytics | ❌ | ✅ |
| Active Customers / month | capped | unlimited |

All limits (cap value, soft-warning threshold, grace period) are **Platform-configurable** — adjustable by the Kavtsya team without a code deployment.

When a Free CafeOwner hits the Active Customer cap: soft warning issued → grace period → Зернятка issuance pauses until CafeOwner upgrades or next billing period.

**Future**: pricing scales for CafeOwners with multiple Cafés — one CafeOwner, many Cafés pays more than a single-café CafeOwner. Not in v1.

## AI scope

AI is a **core learning goal**, not a gimmick. v1 goes deep on one feature:

- **Ворожка (v1)** — LLM-generated coffee fortune personalised using Purchase patterns (time of day, frequency, day of week). No drink-level data is captured in v1. _Future: consider logging the ordered drink during the scan to enable richer, drink-specific fortunes (see backlog issue)._

v2 AI:
- Churn prediction for CafeOwners

## ⏳ Open action items

- [ ] **Reserve the brand** — buy `kavtsya.com` and `kavtsya.app` (consider `.com.ua` too) via [Porkbun](https://porkbun.com) or Namecheap, and grab the `@kavtsya` social handles. _Do this soon — the name is unclaimed but not yet secured._
- [x] ~~Remove the stale `~/dev/claude-skills/mattp.skills/.git/index.lock`.~~ ✓ done 2026-06-13

## Name — **Кавця / "Kavtsya"** ✓

Chosen: **Кавця**, an affectionate diminutive of *кава* ("lil' coffee"). Latin brand spelling **Kavtsya** (pron. KAHV-tsya). The post-Purchase fortune feature is branded **Ворожка** ("the fortune-teller") inside the app.

Availability (checked 2026-06-13): no app named Kavtsya/Кавця on either store, no matching coffee brand/trademark, domains appear free (no live site / search footprint). One adjacent name to note: existing retailer «Кавуська». _To finish manually: grab `kavtsya.com`/`.app` at a registrar; confirm in-store search; optional Ukrpatent/EUIPO check (classes 42/43)._

## Roadmap

1. ~~Finalize the name.~~ ✓ **Kavtsya** (pending registrar purchase)
2. ~~Finalize feature scope + AI scope.~~ ✓ done 2026-06-15 (see Feature tiers above)
3. Tech / architecture plan (Expo, auth, QR generate/scan, push via Expo notifications, backend, AI service).
4. PRD → issues, then build.

## Dev environment

Built with Claude Code using custom skill presets from the `mp-skills` marketplace (fork `git-sparrow/mattp.skills`). This repo enables `mp-core` + `mp-engineering` via `.claude/settings.json`. Run `/mp-engineering:setup-matt-pocock-skills` once before using the engineering workflow skills.
