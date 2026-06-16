# Kavtsya

A multi-café loyalty platform for the Ukrainian market. Each Café runs its own independent loyalty program. Customers collect Зернятка and redeem Rewards at the Cafés where they make purchases; CafeOwners scan QR codes, configure their program, and manage outreach.

## Language

### Participants

**Customer**:
A person who uses the app to collect Зернятка and redeem Rewards at participating Cafés.
_Avoid_: User, member, guest

**Кавовар** (CafeOwner in code and docs):
The operator of a participating Café — scans Customer QR codes, configures the loyalty program, and sends push notifications. A CafeOwner is also a Customer: one account holds both roles, and CafeOwner Mode is simply unlocked on top of the standard Customer experience. Café registration happens as part of CafeOwner signup — one combined flow.
_Avoid_: Owner, admin, merchant, barista, manager

**Café**:
A participating coffee shop registered on the platform.
_Avoid_: Shop, venue, store, location

**Platform**:
The Kavtsya team acting as operator — sets and adjusts business-level configuration (free-tier limits, grace periods, pricing) without code deployments. Distinct from CafeOwners and Customers.
_Avoid_: Admin, founder, superuser

### App structure

**CafeOwner Mode**:
The section of the app unlocked for CafeOwners — separate UX from the Customer experience but within the same app and single App Store listing. CafeOwners switch into CafeOwner Mode to scan QR codes, configure their loyalty program, and manage push notifications.
_Avoid_: Owner app, business app, admin panel

### Loyalty mechanics

**Зернятко** (Zernyatko — "little bean"):
The loyalty unit of Kavtsya — one bonus point per Purchase. Customers accumulate Зернятка at a Café; each Café holds its own independent Зернятко balance per Customer. In v1: one Purchase = one Зернятко, regardless of how many drinks were ordered. When the balance reaches the Café's threshold (CafeOwner-configurable; default 10), the Customer redeems their Reward. Used as the canonical term in the UI and codebase (e.g. database field name).
_Avoid_: Stamp, credit, punch, card

**Purchase**:
A Customer buying at least one drink at a Café. Recorded when the CafeOwner scans the Customer's QR code — this adds one Зернятко to the Customer's balance at that Café and triggers Ворожка.
_Avoid_: Order, transaction, visit

**Reward**:
What a Customer redeems after accumulating a threshold number of Зернятка at a Café. The CafeOwner selects the Reward from platform-defined defaults: free drink (any item), free drink (specific item the CafeOwner names), fixed discount (e.g. ₴30 off), or percentage discount (e.g. 10% off). Custom Rewards defined by the CafeOwner are a future feature.
_Avoid_: Prize, benefit, perk, offer

**Redemption**:
The act of a Customer claiming a Reward once their Зернятко balance at a Café reaches that Café's threshold. The CafeOwner confirms it with a separate scan-to-confirm action (distinct from a Purchase scan) — confirming the Reward was handed over. On confirmation the balance **subtracts the threshold** (e.g. balance 23, threshold 10 → 13); it does not reset to 0, so Зернятка earned toward the next Reward (including any from a Purchase on the same visit) are preserved. A balance of 2× threshold or more can therefore bank multiple Redemptions.
_Avoid_: Claim, cash-in, reset

**Signup Reward** _(postponed — not in v1, see Backlog)_:
A one-time bonus earned at registration, credited as 1–2 Зернятка to the Customer's balance at the first Café they make a Purchase at. Designed to give immediate tangible value and reduce install hesitation. Postponed out of v1 on 2026-06-16; kept here as the canonical term for when it returns.
_Avoid_: Welcome bonus, onboarding reward, first-visit discount

### Business model

**Plan**:
The subscription tier a CafeOwner is on — Free or Paid. Customers are always free. Free Plan includes core loyalty features (QR scan, Зернятка, Reward configuration) with a cap on Active Customers. Paid Plan unlocks push notifications and analytics, and removes the Active Customer cap. All limits are set by the Platform and configurable without a code deployment.
_Avoid_: Subscription, tier, account type

**Active Customer**:
A Customer who has made at least one Purchase at a Café within the current calendar month. Used as the billing metric for the Free Plan cap. The cap value, soft-warning threshold, and grace period duration are all Platform-configurable. When the cap is exceeded: the CafeOwner receives a soft warning; Зернятка issuance continues through a grace period before pausing.
_Avoid_: Monthly user, active user

### Features

**Ворожка** (vorozhka — "the fortune-teller"):
The post-Purchase AI feature that shows the Customer a coffee fortune after each Purchase. In v1 a scheduled job uses the AI provider to generate a batch of **generic** fortunes **once a day** into a pool; each Purchase scan serves a **random** fortune from that day's pool — there is no live AI call during the scan and no per-Customer personalization yet. Tied to the Ukrainian tradition of fortune-telling by coffee grounds (_ворожіння на кавовій гущі_). _Future: personalized fortunes per Customer using Purchase patterns (time of day, frequency, day of week, Café)._
_Avoid_: Fortune, prediction, horoscope
