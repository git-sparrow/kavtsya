# Kavtsya — Project Brief

_Last updated: 2026-07-02 · Status: **building** — scope and architecture locked; PRD done, issues open, vertical slices shipping (core loyalty loop wired end to end through #20)_

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
| Customer QR | **Dynamic** — short-lived signed token (Platform-tunable; currently 90s TTL + 30s grace), single-use for earning | Prevents QR screenshot sharing / stamp farming; app refreshes token from API |
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
- **Self-check-in — flip the QR direction** (#61) — the Café displays a rotating QR; the Customer scans it to claim the Зернятко. Removes the staff surface for earning entirely, but deliberately loosens the ADR 0006 trust model (unattended claiming, rate-limited) — a v2 experiment gated on #56 being decided and real pilot data.
- CafeOwner: **staff attribution — per-barista PINs + shift analytics** (Pro, #62) — the Poster/Square pattern; the v2–v3 evolution of #56's scanner grant. Includes the «Ворожка на зміну» shift-close fortune for baristas. v1 only needs the nullable `issued_by_user_id` ledger column so no flag-day later.

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

### Improving the odds — GTM recommendations (2026-07-06 review)

Honest framing first: the real competitor is not Expirenza — it is the **paper stamp card** (zero cost, zero friction, works offline). The single most likely point of death is the **install-and-signup cliff** before the first Зернятко. Structural advantage to lean on: per-Café loyalty (ADR 0001) means the product is complete and useful with **exactly one Café** — a 2–3-café pilot is a real test, not a toy. Recommendations, by leverage:

1. **Kill the install cliff.** A printed table-tent QR that opens something *instantly* — an iOS App Clip (the `expo:add-app-clip` skill is already vendored) or a tiny web page showing today's Ворожка + "install to start collecting". First fortune before first install: the fortune is the hook, the Зернятко is the retention.
2. **Give the Free tier one teaser stat.** "27 Customers came back this month" on the CafeOwner home screen — free, one number, and it is the ad for Pro. Gating analytics entirely means Free owners never learn what they're missing.
3. **Founding-café pilot.** First 5–10 Cafés get Pro free forever, in one neighborhood, in exchange for feedback + a table tent on every table. What we're buying is the **repeat-visit-rate** number — the only metric that sells Café #11.
4. **Validate Ворожка before the app carries it.** A web/Instagram «ворожіння на кавовій гущі» costs a weekend, builds the brand's social footprint, and tests whether people actually share fortunes — de-risking the shareable-card backlog item for free.
5. **Reframe the Pro pitch from "analytics" to "she came back".** Owners don't buy dashboards; they buy "Kavtsya brought Олена back after 3 weeks" — the AI win-back story ADR 0011 already names as the hero. The first Pro artifact should be a concrete win-back message, not a chart. (Related trial-design caveat: a 14-day trial of analytics over 14 days of data shows almost nothing — the trial should showcase outreach, which works from day one.)
6. **Buy the domains** (#1) — the cheapest risk-elimination on the board.

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

## ⚠️ Open design questions (surfaced in the 2026-07-06 review — none block the current slices)

1. **Staff at the counter** → tracked as **#56**, _brainstormed 2026-07-07 — recommendation on the issue_. In real cafés the person scanning is usually a barista, not the CafeOwner — but the only way to scan today is to be signed in as the owner, whose account is *also* their personal Customer account (own QR, own balances at other Cafés) and will later hold campaigns/analytics. Recommended direction: a café-scoped, time-boxed, revocable **scanner grant**, surfaced first as **«Зміна»** (shift mode on the barista's own phone, owner-configurable lifetime, Free tier), with a «Стійка» kiosk lock as fast-follow; spin-offs #61 (flip-QR self-check-in) and #62 (staff attribution, Pro) in the Backlog. Awaiting three answers on the issue: approve the direction, may a barista earn at their shift Café when a colleague scans them, and the default grant lifetime.
2. **Account deletion** → tracked as **#57**. App Store Guideline 5.1.1(v) requires in-app account deletion. The schema currently `on delete cascade`s `purchases` from `user`, so deleting an account silently rewrites every Café's history/analytics — at odds with the append-only-ledger intent (ADR 0010). Likely answer: anonymize (tombstone user, keep ledger rows) instead of cascade. Decide before the stores, not before #22.
3. **Redemption lock target** → commented on **#22**. ADR 0010 plans the balance check-and-write under `FOR UPDATE` on "the membership row", but no `cafe_memberships` table exists yet — balances are derived straight from `purchases`. #22 must either introduce the memberships row or use a `pg_advisory_xact_lock` keyed on (Café, Customer). Decide at #22 planning time.
4. **Member code is core resilience, not an edge case** → commented on **#21**. The rotating QR makes the happy path depend on the *Customer's* connectivity; in a basement café with no signal the loop simply fails until #21 ships. #21 should follow #22 closely, before any real-world pilot.

Smaller notes filed where they'll be seen: Ворожка daily batch must anchor on Europe/Kyiv + validate Haiku's Ukrainian first (→ #23), Expo push receipts / `DeviceNotRegistered` token pruning (→ #24), and a pilot & store-submission readiness checklist (privacy policy, Play data declarations, Railway backups, domains) as **#58**.

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
4. ~~PRD → issues.~~ ✓ done — tracked in [GitHub Issues](https://github.com/git-sparrow/kavtsya/issues).
5. **Build the vertical slices.** ← in progress. Merged so far: walking skeleton (#15), auth (#16), Cafés (#17), loyalty config (#18), rotating QR token (#19), core scan + Зернятко ledger (#20). Next: Redemption, Ворожка, push, analytics.

## Dev environment

Built with Claude Code. Matt Pocock's workflow skills (`/tdd`, `/to-prd`, `/to-issues`, `/triage`, `/domain-modeling`, …) are **vendored into this repo and committed**, not installed globally: the real files live in `.agents/skills/`, with `.claude/skills/` symlinks pointing at them and `skills-lock.json` pinning the `mattpocock/skills` sources/hashes. They are standalone and **un-namespaced** (`/tdd`, not `/mp-engineering:tdd`) and travel with the repo, so no per-machine global install is needed — update them with `npx skills@latest` against `skills-lock.json`. `.claude/settings.json` additionally pins project-relevant plugins (currently the Expo skills). See [`CLAUDE.md`](CLAUDE.md) for the full working agreement.
