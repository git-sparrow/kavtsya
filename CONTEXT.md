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

**Signup Reward**:
A one-time bonus earned at registration, credited as 1–2 Зернятка to the Customer's balance at the first Café they make a Purchase at. Designed to give immediate tangible value and reduce install hesitation.
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
The post-Purchase AI feature that generates a personalized coffee fortune for the Customer after each Purchase. v1 personalizes using Purchase patterns only (time of day, Purchase frequency, day of week, Café) — no drink-level data is captured during the scan. Tied to the Ukrainian tradition of fortune-telling by coffee grounds (_ворожіння на кавовій гущі_).
_Avoid_: Fortune, prediction, horoscope
