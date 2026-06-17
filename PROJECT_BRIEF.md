# Kavtsya — Project Brief

_Last updated: 2026-06-15 · Status: **build phase** — scope and architecture locked; PRD → issues → build_

## Purpose

A pet project with two real goals:

1. **Learn AI** hands-on.
2. **Refresh engineering fundamentals** (JavaScript, TypeScript, React, React Native).

The coffee-shop loyalty app is the vehicle for both. Market: **Ukraine**.

## What it is

A mobile loyalty app connecting coffee shops with their Customers, plus a CafeOwner-facing side for scanning and outreach. Designed to be **simple — no redundant functionality**.

## Product decisions

| Area | Decision | Rationale |
|---|---|---|
| Scope | **Multi-café platform** | Many cafés + CafeOwners; each Café runs its own independent loyalty program — Зернятка do not pool across Cafés |
| AI | **Core focus**, not a gimmick | The base feature set is ~90% standard CRUD; AI must be deliberate to actually learn it |

## Tech stack

| Area | Decision | Rationale |
|---|---|---|
| Mobile | **React Native + Expo** (iOS + Android) | Reuses existing JS/TS/React strength; cross-platform; native Swift can come later |
| Backend | **Hono on Node.js (Railway)** | TypeScript-first, standard Node.js environment, no TCP restrictions; Railway hosts both the server and PostgreSQL in one place |
| Database | **PostgreSQL on Railway** + `postgres.js` driver + Zod | Plain SQL, no ORM; standard transferable skills; Zod validates all API inputs |
| Auth | **Email/password + Google + Apple Sign-In** via Better Auth | Email/password as baseline; Google/Apple for UX; Apple Sign-In required by App Store when any social login is offered |
| Customer QR | **Dynamic** — rotates every ~60s via signed token | Prevents QR screenshot sharing / stamp farming; app refreshes token from API |
| Push | **Expo Push Notifications** | Built into Expo; store push tokens per Customer; CafeOwner one-tap campaigns (Paid Plan) |
| AI service | **Custom provider abstraction** — Claude (Haiku) by default | TypeScript interface + per-provider implementations; swap model/provider via env var; starts with Anthropic, no external AI SDK dependency |
| Repo structure | **Monorepo** — `apps/mobile` + `apps/api` + shared types | Shared TypeScript types between app and API; one repo to manage |

## Feature tiers

### MVP (v1)

**Customer**
- Login + unique QR code
- Collect Зернятка — one per Purchase, per Café (Зернятка do not pool across Cafés)
- Redeem Reward when Зернятко threshold is reached
- **Ворожка** — AI-generated coffee fortune after each Purchase

**CafeOwner**
- Scan Customer QR to issue a Зернятко (Purchase) and to confirm a Redemption when the threshold is reached
- Configure loyalty program: Зернятко threshold (configurable; default 10) + Reward (from platform defaults: free drink, free specific drink, fixed discount, % discount)
- Send push notifications (menu updates, seasonal products) — one-tap campaigns
- Basic analytics: peak hours, repeat vs new Customers

### v2 (planned, not v1)

- Churn alerts — AI-powered: "This regular hasn't visited in 3 weeks" (requires purchase history data to exist first)
- Discovery mode — map/list of nearby Kavtsya Cafés
- Streaks — visit cadence milestones for Customers

### Backlog (good idea, not yet scheduled)

- Signup Reward — 1–2 bonus Зернятка as an install hook _(postponed from v1 on 2026-06-16; revisit once the core loop is live. Note: Зернятка are per-Café, so any implementation must credit at first Purchase, not at signup.)_
- Shareable Ворожка card for social media _(needs value validation before building)_
- Seasonal / holiday Ворожка fortunes (Ukrainian holidays)
- Coffee personality profile — AI label based on order patterns
- Personalized push notifications based on order history
- CafeOwner: demand forecasting
- CafeOwner: **custom Rewards** (Pro, beyond platform defaults) — *display-only* first (barista honours manually, no POS), then *auto-applied* at the register with POS integration. Free keeps the full platform-default set.
- CafeOwner: **POS integration** (Pro) — optional enrichment of the loyalty loop for cafés that already run a POS (Poster first). An edge adapter (`POSProvider`, mirroring the AI provider abstraction), **never a dependency** — the core loop always works without a POS. Adds order-level data (drinks, spend), auto-applied discount Rewards at the register, and drink-specific Ворожка. Still requires the QR scan to bind a transaction to a Customer. See `docs/adr/0012`.

## Business model

Customers are always free. CafeOwners are the revenue source — freemium with a single Paid tier (**Pro**). The split is **feature-gated, not usage-capped**: Free Cafés get the full core loyalty loop with no limits; Pro unlocks CafeOwner growth tools. There is no cap on how many Customers a Free Café can serve, and nothing ever pauses Зернятко issuance. Guiding line: **Customer-facing features are Free; CafeOwner growth tools are Paid.** See `docs/adr/0011`.

| Feature | Free | Pro |
|---|---|---|
| QR scan + Зернятка issuance (unlimited) | ✅ | ✅ |
| Reward + threshold configuration (platform defaults) | ✅ | ✅ |
| Ворожка (coffee fortune) | ✅ | ✅ |
| Push campaigns / outreach | ❌ | ✅ |
| Analytics | ❌ | ✅ |

The Pro hero feature is **outreach + AI retention** (push campaigns + AI win-back of lapsing regulars), with analytics as the supporting layer.

**Pricing & positioning** — one Pro tier, flat monthly **per Café**, target ~**₴390–490/mo** with a **14-day trial** and an annual discount. Positioning: _"Лояльність і маркетинг для кав'ярні — без POS, без IT, лише QR-код."_ The wedge is **no POS required** — Ukrainian incumbents (Poster ₴600–2,142/mo; Expirenza/mono with free loyalty but POS-integration ~₴495/mo) all tie loyalty to a cash-register system, while most cafés use nothing or paper stamps. Main competitive threat: **Expirenza (by mono)**; defend on no-POS simplicity + Ворожка delight + AI, not on accrual mechanics.

**Future Paid extras** (post-v1): Custom Rewards (beyond platform defaults), churn alerts, AI win-back, and **POS integration** (see Backlog). Other features uncovered during build may also land behind Pro.

**Future**: pricing scales for CafeOwners with multiple Cafés — one CafeOwner, many Cafés pays more than a single-café CafeOwner. Not in v1.

## AI scope

AI is a **core learning goal**, not a gimmick. v1 keeps the AI surface simple but real:

- **Ворожка (v1)** — a scheduled job uses Claude (via the provider abstraction, `ADR 0007`) to generate a batch of **generic** coffee fortunes **once a day** into a pool. Each Purchase scan serves a **random** fortune from that day's pool — no live AI call on the scan, no per-Customer personalization in v1. This still exercises the provider abstraction, prompt design, and a scheduled job, without per-scan cost or latency. _Future: personalized AI fortunes per Customer using Purchase patterns (time of day, frequency, day of week); optionally log the ordered drink during the scan for drink-specific fortunes (see backlog)._

v2 AI:
- Personalized Ворожка — per-Customer fortunes from Purchase patterns
- Churn prediction for CafeOwners

## ✓ Resolved design questions (were blocking the PRD)

Surfaced during the architecture review on 2026-06-15; all four resolved on 2026-06-16. The PRD is unblocked.

1. ~~**Redemption mechanic (highest priority — core loop is unspecified).**~~ ✓ **Resolved 2026-06-16** — Subtract-the-threshold, confirmed via a **single scan**. One QR scan identifies the Customer; the CafeOwner can issue a Зернятко and/or confirm a Redemption as distinct actions off that one scan (no second scan — refined 2026-06-17). The balance subtracts the threshold (does not reset to 0), so beans toward the next Reward are preserved and a 2× balance can bank multiple Redemptions. See **Redemption** in `CONTEXT.md` and `docs/adr/0006`, `docs/adr/0010`.
2. ~~**"Instant signup reward" vs "credited at first Purchase" contradiction.**~~ ✓ **Resolved 2026-06-16** — Signup Reward postponed out of v1 to the Backlog. Removes the contradiction entirely; revisit after the core loop ships.
3. ~~**Зернятко issuance must not depend on Ворожка.**~~ ✓ **Resolved 2026-06-16** — Confirmed, and the mechanism changed to make it structural: Ворожка is now a daily AI-generated batch served randomly per scan (see AI scope), so the Purchase scan makes **no live AI call at all**. Зернятко issuance is therefore trivially independent of the fortune. Captured as `docs/adr/0009`.
4. ~~**Single-use QR token?**~~ ✓ **Resolved 2026-06-16** — Confirmed single-use. Each rotating token is consumed on first successful scan (by `jti`); re-scans are rejected. Closes the double-issuance / farming window. Captured in `docs/adr/0006`.

## ⏳ Open action items

- [ ] **Reserve the brand** — buy `kavtsya.com` and `kavtsya.app` (consider `.com.ua` too) via [Porkbun](https://porkbun.com) or Namecheap, and grab the `@kavtsya` social handles. _Do this soon — the name is unclaimed but not yet secured._
- [x] ~~Remove the stale `~/dev/claude-skills/mattp.skills/.git/index.lock`.~~ ✓ done 2026-06-13

## Name — **Кавця / "Kavtsya"** ✓

Chosen: **Кавця**, an affectionate diminutive of *кава* ("lil' coffee"). Latin brand spelling **Kavtsya** (pron. KAHV-tsya). The post-Purchase fortune feature is branded **Ворожка** ("the fortune-teller") inside the app.

Availability (checked 2026-06-13): no app named Kavtsya/Кавця on either store, no matching coffee brand/trademark, domains appear free (no live site / search footprint). One adjacent name to note: existing retailer «Кавуська». _To finish manually: grab `kavtsya.com`/`.app` at a registrar; confirm in-store search; optional Ukrpatent/EUIPO check (classes 42/43)._

## Roadmap

1. ~~Finalize the name.~~ ✓ **Kavtsya** (pending registrar purchase)
2. ~~Finalize feature scope + AI scope.~~ ✓ done 2026-06-15 (see Feature tiers above)
3. ~~Tech / architecture plan.~~ ✓ done 2026-06-15 (see Tech stack above + `docs/adr/`)
4. **PRD → issues, then build.** ← next

## Dev environment

Built with Claude Code using custom skill presets from the `mp-skills` marketplace (fork `git-sparrow/mattp.skills`). This repo enables `mp-core` + `mp-engineering` via `.claude/settings.json`. Run `/mp-engineering:setup-matt-pocock-skills` once before using the engineering workflow skills.
