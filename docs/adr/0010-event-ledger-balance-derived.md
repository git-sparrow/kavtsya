# Зернятко balance is a derived event ledger, not a mutable counter

Зернятка are recorded as an append-only ledger of immutable events — a `purchases` table (one row per Зернятко earned) and a `redemptions` table (one row per Reward claimed) — rather than a single mutable `balance` integer per (Customer, Café). Balance is *derived*: `count(purchases) − sum(redemptions.beans_spent)`. A `cached_balance` may be kept on the membership row for speed and as a lock target, but the ledger is the source of truth.

We considered the simpler mutable counter (`+1` on Purchase, `−threshold` on Redemption). We rejected it because almost everything else already committed to wants the history that a counter throws away:

- **Analytics** (peak hours, repeat vs new Customers) needs timestamped Purchase events; a counter cannot reconstruct them.
- **Churn (v2)** "requires purchase history data to exist first" (PROJECT_BRIEF). Storing events from v1 is precisely what makes v2 possible without a flag day; `last_purchase_at` already answers "who went quiet."
- **Monthly reach / repeat vs new** ("≥1 Purchase this calendar month", distinct Customers) is a query over Purchase events, not derivable from a counter.
- **Redemption safety.** "Subtract the threshold" on a mutable counter is a read-modify-write that double-fires under concurrency. As ledger entries with balance = `SUM(deltas)`, the operation is auditable; the check-and-write run in one transaction holding a `FOR UPDATE` lock on the membership row.
- **Shareable Ворожка card (backlog)** is nearly free if each Purchase row stores the `fortune_id` it served.

Two snapshots keep history correct as configuration drifts: a Redemption stores `beans_spent` (the threshold *at the time*) and the Reward fields, so changing a Café's threshold or Reward later never re-prices a past Redemption.

This is also the more instructive thing to build for the project's backend-fundamentals goal, and it is pure SQL — squarely in the spirit of ADR 0005 (raw SQL, no ORM). The trade-off is more rows and a derivation query instead of a single column read; the `cached_balance` covers the hot path, and a periodic check that `cached_balance` equals the derived value is a strong invariant test.

We use two tables (`purchases`, `redemptions`) rather than one signed-`delta` ledger because Purchase and Redemption are distinct first-class terms in CONTEXT.md and their queries differ; keeping them separate makes the schema read like the domain.
