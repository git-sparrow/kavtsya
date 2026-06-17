# POS integration is an optional edge adapter, never a dependency

When POS integration ships (a future Pro feature, see PROJECT_BRIEF backlog), it is built as an optional enrichment of the loyalty loop behind a `POSProvider` abstraction — never as something the core loop depends on. A Café with no POS connected must get the identical, fully-working loyalty experience.

This looks contradictory against our positioning wedge ("no POS, no IT, just a QR code", ADR 0011), but it is a sequence, not a conflict: win the majority who use nothing with no-POS simplicity, then *also* serve and upsell the minority who already run a POS — without ever compromising the no-POS core.

## Decision

- **One interface, one implementation per POS.** A `POSProvider` interface (e.g. `getOrderForScan()`, `applyReward()`) with a concrete implementation per system, mirroring the AI provider abstraction (ADR 0007). **Poster first** — it has a real public API and the largest install base in Ukraine. We deliberately do **not** integrate Expirenza: it is a competitor and itself a loyalty layer, not a neutral POS to read from.
- **Additive, never blocking.** The core loyalty loop runs identically with zero POS connected. If the POS API is slow or down, Зернятко issuance and Redemption still commit — the same independence rule as Ворожка (ADR 0009). POS data only enriches; it never gates.
- **The QR scan stays.** A POS knows that *an order happened*, not *which Customer*. Only the QR scan binds a transaction to a Customer, so integration adds a data payload on top of the existing scan rather than replacing it.

## What it enriches (the Pro value)

1. **Order-level data** — drinks ordered and amount spent, populated into nullable fields on the `purchases` ledger (ADR 0010). Enables real spend/product analytics instead of "a Purchase happened."
2. **Auto-applied discount Rewards** — `discount_fixed` / `discount_pct` Rewards applied to the bill at the register automatically, removing the manual-discount awkwardness of the no-POS model.
3. **Drink-specific Ворожка** — fortunes that reference the actual order, feeding the personalization roadmap.
4. **Reconciliation** — matching Зернятка against real sales for the owner's books.

## Consequences

- **Now:** keep the issuance/redemption logic free of any POS assumption, and leave room in the `purchases` ledger for nullable order fields (`order_total`, `items`). This is seam-readiness, costing nothing, and avoids a later migration — the same anticipatory approach as the ledger design itself.
- **Deferred:** the actual adapter is post-revenue work. It is per-POS engineering plus API access (possibly a partnership) and serves a minority, so it waits until the no-POS product has paying Cafés.
- **Pricing:** because v1 has a single Pro tier (ADR 0011), POS integration lands later as an add-on or a higher "Pro+" tier — decided when built, not now.
