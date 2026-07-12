# Kavtsya

A multi-café loyalty platform for the Ukrainian market. Each Café runs its own independent loyalty program. Customers collect Зернятка and redeem Rewards at the Cafés where they make purchases; CafeOwners scan QR codes, configure their program, and manage outreach.

## Language

### Participants

**Customer**:
A person who uses the app to collect Зернятка and redeem Rewards at participating Cafés.
_Avoid_: User, member, guest

**Кавовар** (CafeOwner in code and docs):
The operator of a participating Café — scans Customer QR codes, configures the loyalty program, and sends push notifications. A CafeOwner is also a Customer: one account holds both roles, and CafeOwner Mode is simply unlocked on top of the standard Customer experience. Café registration is a post-signup action from Settings; registering unlocks CafeOwner Mode, which then becomes the account's primary surface (ADR 0015).
_Avoid_: Owner, admin, merchant, barista, manager

**Café**:
A participating coffee shop registered on the platform.
_Avoid_: Shop, venue, store, location

**Platform**:
The Kavtsya team acting as operator — sets and adjusts business-level configuration (pricing, which features are Paid-gated, platform-default Rewards) without code deployments. Distinct from CafeOwners and Customers.
_Avoid_: Admin, founder, superuser

### App structure

**Customer Mode**:
The default app surface — the Customer's own identity screen (their QR and Зернятка balances) and nothing role-specific. Every account has it; it is the primary surface for a plain Customer and a secondary, opt-in surface (reached via Settings) for a CafeOwner or a barista on shift.
_Avoid_: Customer home, main screen, default view

**CafeOwner Mode**:
The section of the app unlocked for CafeOwners — separate UX from the Customer experience but within the same app and single App Store listing. It is the **primary, default surface** for a CafeOwner: they land here on launch and reach their own Customer Mode only via a Settings excursion (ADR 0015). CafeOwners use it to scan QR codes, configure their loyalty program, manage push notifications, and run the Barista Roster.
_Avoid_: Owner app, business app, admin panel

**Scanner Mode**:
The app surface a barista's own app becomes during an active Shift — a focused, near-kiosk scanner (scan + Redemption confirm) with a single exit, «Завершити зміну». It is not an account type: the account stays a Customer; only the app's surface is commandeered while a Shift is active. Reached by landing precedence — an active Shift wins over CafeOwner and Customer Modes (ADR 0015).
_Avoid_: Barista mode (as an account type), staff mode

**Barista Roster**:
A Café's persistent, café-scoped list of approved baristas — a trust relationship on a normal Customer account, not a separate account. The CafeOwner **approves** an account onto the roster once (turning a pending request into a rostered barista) and **removes** it once when they leave. Roster membership — not the printed poster QR — is the security boundary: only a rostered barista can start a Shift (`docs/adr/0013`).
_Avoid_: Staff list, employee roster, team (as the code term)

**Shift** («Зміна» in the UI):
One working session of Scanner Mode at a Café. A barista on that Café's Barista Roster scans the Café's **printed wall poster** to start one; a non-rostered scan instead raises a deduped, rate-limited pending approval request. A Shift grants scan + Redemption confirm for that one Café only (no program config, no analytics), is limited to one active per account, and ends when the barista ends it («Завершити зміну»), the owner ends it, or a rolling safety-net cap auto-expires it (`docs/adr/0013`). Free tier. Nobody may scan their own QR (scanner ≠ scanned), but a barista may still earn Зернятка when a colleague scans them.
_Avoid_: Зміна (in code/docs — use Shift), Scanner Grant, staff account, employee login, barista mode (as an account type)

### Loyalty mechanics

**Зернятко** (Zernyatko — "little bean"):
The loyalty unit of Kavtsya — one bonus point per Purchase. Customers accumulate Зернятка at a Café; each Café holds its own independent Зернятко balance per Customer. In v1: one Purchase = one Зернятко, regardless of how many drinks were ordered. When the balance reaches the Café's threshold (CafeOwner-configurable; default 10), the Customer redeems their Reward. Used as the canonical term in the UI and codebase (e.g. database field name).
_Avoid_: Stamp, credit, punch, card

**Purchase**:
A Customer buying at least one drink at a Café. Recorded when the CafeOwner scans the Customer's QR code (or, when the QR can't be scanned, enters the Customer's static **member code** — the offline fallback, see `docs/adr/0006`) — this adds one Зернятко to the Customer's balance at that Café and triggers Ворожка. A CafeOwner cannot earn Зернятка at a Café they operate (self-farming guard, `docs/adr/0003`).
_Avoid_: Order, transaction, visit

**Reward**:
What a Customer redeems after accumulating a threshold number of Зернятка at a Café. Every Café — Free or Pro — chooses its Reward from the **platform-default set**: free drink (any item), free drink (specific item the CafeOwner names), fixed discount (e.g. ₴30 off), or percentage discount (e.g. 10% off). The default set is **Platform-tunable** (a new default can be added without a code deploy). **Custom Rewards** — anything the defaults can't express (combos like "drink + pastry", tiered/escalating, non-menu perks, conditional offers) — are a **Pro** feature, shipping in two flavours: *display-only* first (the app shows the reward text, the barista honours it manually — no POS needed), then *auto-applied* at the register once POS integration lands (`docs/adr/0012`).
_Avoid_: Prize, benefit, perk, offer

**Redemption**:
The act of a Customer claiming a Reward once their Зернятко balance at a Café reaches that Café's threshold. It is confirmed as a separate action off a **single** QR scan: the one scan identifies the Customer, and the CafeOwner can issue a Зернятко (Purchase) and/or confirm a Redemption from it — distinct actions, no second scan. On confirmation the balance **subtracts the threshold** (e.g. balance 23, threshold 10 → 13); it does not reset to 0, so Зернятка earned toward the next Reward (including any from a Purchase on the same visit) are preserved. A balance of 2× threshold or more can therefore bank multiple Redemptions (each a distinct confirm action). The threshold subtracted is **snapshotted** at confirmation time, so a later change to the Café's threshold never re-prices a past Redemption.
_Avoid_: Claim, cash-in, reset

**Signup Reward** _(postponed — not in v1, see Backlog)_:
A one-time bonus earned at registration, credited as 1–2 Зернятка to the Customer's balance at the first Café they make a Purchase at. Designed to give immediate tangible value and reduce install hesitation. Postponed out of v1 on 2026-06-16; kept here as the canonical term for when it returns.
_Avoid_: Welcome bonus, onboarding reward, first-visit discount

### Business model

**Plan**:
The subscription tier a Café is on — Free or **Pro** (the single Paid tier, `docs/adr/0011`). Customers are always free. The split is **feature-gated, not usage-capped**: the Free Plan includes the full core loyalty loop with no limits — QR scan, unlimited Зернятка issuance, and Reward configuration from platform defaults. The Pro Plan unlocks push campaigns and analytics (and future paid extras — Custom Rewards, churn alerts). There is no cap on how many Customers a Free Café can serve.
_Avoid_: Subscription, tier, account type

**Active Customer**:
A distinct Customer with at least one Purchase at a Café within a given period (e.g. a calendar month, or a rolling 30 days). Purely an **analytics** metric — monthly reach, repeat vs new Customers, and the basis for future churn windows. Not tied to billing: the Free Plan has no cap.
_Avoid_: Monthly user, active user

### Features

**Ворожка** (vorozhka — "the fortune-teller"):
The post-Purchase AI feature that shows the Customer a coffee fortune after each Purchase. In v1 a scheduled job uses the AI provider to generate a batch of **generic** fortunes **once a day** into a pool; each Purchase scan serves a **random** fortune from that day's pool — there is no live AI call during the scan and no per-Customer personalization yet. Tied to the Ukrainian tradition of fortune-telling by coffee grounds (_ворожіння на кавовій гущі_). _Future: personalized fortunes per Customer using Purchase patterns (time of day, frequency, day of week, Café)._
_Avoid_: Fortune, prediction, horoscope
