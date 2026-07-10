# Freemium monetization: feature-gated, not usage-capped; "no POS" is the wedge

Kavtsya monetizes CafeOwners through a **feature-gated** freemium model with a single Paid tier ("Pro"), not a usage cap. The Free Plan delivers the *complete* core loyalty loop with no limits; Pro unlocks CafeOwner **growth tools**. Customers are always free.

## The dividing line

**Customer-facing features are Free; CafeOwner growth tools are Paid.** Customer-facing features (Зернятка, Rewards, Ворожка — including future personalized fortunes) grow the Customer base, which is what makes the platform valuable to Cafés; throttling them would throttle adoption. CafeOwner growth tools (outreach, analytics, AI retention) directly help an owner make more money, so they are what an owner will pay for.

| | Free | Pro |
|---|---|---|
| QR scan + unlimited Зернятка issuance | ✅ | ✅ |
| Rewards from platform defaults + threshold config | ✅ | ✅ |
| Ворожка (coffee fortune) | ✅ | ✅ |
| Push campaigns / outreach | ❌ | ✅ |
| Analytics | ❌ | ✅ |
| Future paid extras (Custom Rewards, churn alerts, AI win-back, POS integration) | ❌ | ✅ |

The Pro hero feature is **outreach + AI retention** (push campaigns to fill slow hours, AI win-back of lapsing regulars), with analytics as the supporting layer — not analytics on its own, which owners glance at once and forget.

## Pricing & positioning

- One Pro tier in v1 (no three-tier complexity). Flat monthly, **per Café**; multi-Café owners pay per Café (already in the brief).
- Target ~**₴390–490/mo** per Café, with a **14-day Pro trial** and an annual discount (~2 months free).
- Positioning headline: **"Лояльність і маркетинг для кав'ярні — без POS, без IT, лише QR-код."** (Loyalty + marketing — no POS, no IT, just a QR code.)

## Why this fits the market (researched 2026-06-17)

Ukrainian incumbents tie loyalty to a POS: **Poster** ₴600–2,142/mo, **SmartCafe/Syrve/LoyaltyPlant** enterprise/sales-led, and **Expirenza (by mono)** gives loyalty *free* but needs POS integration (~₴495/mo) and monobank's ecosystem. Most cafés use **nothing or paper stamps**.

That yields the wedge, in priority order:
1. **No POS, no IT — just a QR code.** Every incumbent requires a POS; Kavtsya requires zero integration. For the majority who use nothing, that is the difference between adoptable-in-minutes and "buy a whole system."
2. **Consumer delight (Ворожка)** — no incumbent has an AI brand-magic hook; it drives Customer adoption and offsets the weak per-Café network effect.
3. **AI marketing/retention** — incumbents do bonus accrual + SMS blasts; none do AI win-back.

**Loyalty must stay Free** because Expirenza already gives it away — the market won't pay for the stamp loop. We monetize outreach + AI, not accrual.

**Main threat: Expirenza (by mono)** — huge distribution and trust, free loyalty, already in cafés. Defense is the wedge above (no-POS simplicity + delight + AI) and not being locked to one bank's ecosystem. We do not try to out-bonus them on accrual mechanics.

## Consequence

Pro entitlement is a per-Café flag (`cafes.plan`). Gating is checked at the feature boundary (campaigns, analytics endpoints), never in the core loyalty path — Зернятко issuance is Plan-independent, mirroring ADR 0009's independence rule. One deliberate, fenced exception (2026-07-10, #25 grilling): a **single permanent free teaser stat** — the returning-customers count on the owner's café home — is un-gated as the built-in ad for Pro. It is the *only* free analytics number; adding any other free-tier stat requires amending this ADR. Future POS integration is an *optional enrichment* of the loyalty loop, never a dependency (see future direction below and the backlog).
