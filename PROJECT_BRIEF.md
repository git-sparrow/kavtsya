# Kavtsya — Project Brief

_Last updated: 2026-07-27 · Status: **building** — scope and architecture locked. **This line + the Roadmap below are the single status home** (CLAUDE.md links here; nothing else restates status). Everything spec-frozen on 2026-07-10 is merged except account deletion: core loop (earn #20, Redemption #22, Ворожка #23), member code (#21), «Зміна» scanner grants + Barista Roster (#80, #97–#99), Pro gating + push campaigns (#24), analytics + free teaser (#25). Next: account deletion (#81, pre-store) → provision production (#65) → pilot & store checklist (#58). In parallel: **UI redesign** from the Mari handoff (epic #131, turns #132–#138 merged, delete-account exit #143 remaining; client export #139 and café transfer #160 postponed out of v1)._

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
| AI service | **Custom provider abstraction** — Claude (Sonnet 5) by default (ADR 0007, amended 2026-07-10) | TypeScript interface + per-provider implementations; swap model/provider via env var; starts with Anthropic, no external AI SDK dependency |
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
- CafeOwner: **Café ownership transfer — «передати кав'ярню»** (#160) — hand a Café to another person instead of closing it: program, poster, roster, history, Customers and their Зернятка all survive, and nothing moves until the recipient accepts. The non-lossy alternative to archival, which freezes every Customer's balance at that Café. _Split out of #143 on 2026-07-27, out of the redesign epic and out of v1. **Gated: needs an ADR superseding ADR 0014** (which rejected transfer for v1 and froze «deletion is never blocked») **plus explicit product approval before implementation** — it is net-new backend (invitations, ownership mutation, recipient auth, notifications) and turn 7a would re-couple it to store-blocking #81. Fully designed: screens 7b/7c + 8a–8f (PNGs 61–62, 65–66, 68–73) and the turns 7–8 anatomy in `docs/design/handoff/engineering-handoff.md`._
- CafeOwner: **client-base export — CSV by email** (#139) — the owner's own café data (names, member codes, зернятка, Винагороди, first/last visit), delivered to their email, never as a file on the phone; deliberately **no phones/emails** (Customers gave contacts to Кавця, not the café — reach them via Розсилка). _Postponed from v1 on 2026-07-27 and moved out of the redesign epic (#131): it restyles nothing. It needs an export endpoint with server-side café-ownership enforcement, CSV generation, an export ledger for the «Останній експорт» footer, and the API's first transactional-email infrastructure (provider choice + env/config plumbing + its own ADR). Fully designed: screens 9a–9f (PNGs 74–79) + the turn-9 anatomy and privacy principle in `docs/design/handoff/engineering-handoff.md`. Open at build: activity-only scope / free-not-Pro-gated._
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

**v1 upgrade path (decided 2026-07-10, #24 spec)** — manual: the app shows the Pro pitch + a contact action, and the Platform flips `cafes.plan` by hand once payment is arranged off-app. In-app payments were considered and rejected for v1: selling a digital-service subscription inside the iOS app triggers Apple's IAP obligations (15–30% commission + review risk), and a web checkout needs provider research + ПРРО fiscalization — billing becomes its own issue when a pilot Café actually wants to pay. The 14-day trial is likewise deferred (manual flag flipping *is* the trial at pilot scale).

**Pricing & positioning** — one Pro tier, flat monthly **per Café**, target ~**₴390–490/mo** with a **14-day trial** and an annual discount. Positioning: _"Лояльність і маркетинг для кав'ярні — без POS, без IT, лише QR-код."_ The wedge is **no POS required** — Ukrainian incumbents (Poster ₴600–2,142/mo; Expirenza/mono with free loyalty but POS-integration ~₴495/mo) all tie loyalty to a cash-register system, while most cafés use nothing or paper stamps. Main competitive threat: **Expirenza (by mono)**; defend on no-POS simplicity + Ворожка delight + AI, not on accrual mechanics.

**Future Paid extras** (post-v1): Custom Rewards (beyond platform defaults), churn alerts, AI win-back, and **POS integration** (see Backlog). Other features uncovered during build may also land behind Pro.

**Future**: pricing scales for CafeOwners with multiple Cafés — one CafeOwner, many Cafés pays more than a single-café CafeOwner. Not in v1.

### Improving the odds — GTM

The GTM playbook (the 2026-07-06 review's leverage-ordered recommendations + the 2026-07-07 second brainstorm — install cliff, founding-café pilot, Lviv, launch windows, Telegram bot, DOU.ua, …) lives in [`docs/gtm.md`](docs/gtm.md) (#118). The one-line core it stems from: **the real competitor is the paper stamp card, and the likeliest point of death is the install-and-signup cliff before the first Зернятко.**

## AI scope

AI is a **core learning goal**, not a gimmick. v1 keeps the AI surface simple but real:

- **Ворожка (v1)** — a scheduled job uses Claude (via the provider abstraction, `ADR 0007`) to generate a batch of **generic** coffee fortunes **once a day** into a pool. Each Purchase scan serves a **random** fortune from that day's pool — no live AI call on the scan, no per-Customer personalization in v1. This still exercises the provider abstraction, prompt design, and a scheduled job, without per-scan cost or latency. _Future: personalized AI fortunes per Customer using Purchase patterns (time of day, frequency, day of week); optionally log the ordered drink during the scan for drink-specific fortunes (see backlog)._

v2 AI:
- Personalized Ворожка — per-Customer fortunes from Purchase patterns
- Churn prediction for CafeOwners

## Design questions — all resolved

Every design question that once blocked the PRD (2026-06-15 review) or gated the pilot (2026-07-06 review) has been decided; the decisions live in the ADRs and the frozen issue specs. The full historical record — what was asked, when, and how each call was made — is archived in [`docs/archive/resolved-design-questions.md`](docs/archive/resolved-design-questions.md) (#118).

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
5. **Build the vertical slices.** ← in progress. Merged: walking skeleton (#15), auth (#16), Cafés (#17), loyalty config (#18), rotating QR token (#19), core scan + Зернятко ledger (#20), scan-rejection taxonomy (#50), balance fold (#52), Redemption (#22), Ворожка (#23), member code (#21), «Зміна» scanner grants + Barista Roster (#80, #97–#99), role Modes (#96), design tokens (#94), Pro gating + push campaigns (#24), analytics + free teaser (#25); dev tooling: CI (#64), Argent (#79), dependency-freshness (#105). **The full v1 feature set is live except account deletion.** Remaining before store/pilot: account deletion (#81) → provision production (#65) → readiness checklist (#58) → branding pass (#67). Architecture/quality frontier (agent fodder, any order): #51, #53, #54, #112–#118 (#111 counter-access consolidation — one `authorizeCounter`, Shift-owned grant predicate — landed; #116 Ворожка pool observability — today's pool count on `/health` — landed).
6. **UI redesign** (Mari handoff, epic #131). Full spec + 79 screens vendored at `docs/design/handoff/`; map at `docs/design/redesign-reconciliation.md`. Sliced per turn: tokens #132 → home/redemption/Ворожка #133 → owner scan #134 → owner home/config #135 → settings/analytics #136 → role subscreens #137 → confirm dialogs #138 → delete-account exit #143 (6b + 7d, UI on top of #81, which stays archival-only). Turns 0–6 (#132–#138) merged; #143 remains. **Café ownership transfer (turns 7b/7c + 8) was split out on 2026-07-27** — out of the epic and out of v1 into #160 (Backlog above), which settles the epic's ADR-0014 conflict archival-first: deletion is never blocked, so #143 builds no blocked dialog. **Turn 9, client-base export (#139), was postponed on 2026-07-27** — out of the epic and out of v1, since it restyles nothing and needs a net-new backend incl. the API's first email infrastructure; it now sits in Backlog above.

## Dev environment

Built with Claude Code. Matt Pocock's workflow skills (`/tdd`, `/to-spec`, `/to-tickets`, `/triage`, `/domain-modeling`, …) are **vendored into this repo and committed**, not installed globally: the real files live in `.agents/skills/`, with `.claude/skills/` symlinks pointing at them and `skills-lock.json` pinning the `mattpocock/skills` sources/hashes. They are standalone and **un-namespaced** (`/tdd`) and travel with the repo, so no per-machine global install is needed — update them with `npx skills@latest` against `skills-lock.json`. `.claude/settings.json` additionally pins project-relevant plugins (currently the Expo skills). See [`CLAUDE.md`](CLAUDE.md) for the full working agreement.
