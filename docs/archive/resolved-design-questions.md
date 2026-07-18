# Archive — resolved design questions

> Moved out of [`PROJECT_BRIEF.md`](../../PROJECT_BRIEF.md) on 2026-07-18 (#118): every question here is resolved and its resolution lives in an ADR, CONTEXT.md, or a frozen issue spec. Kept verbatim as the historical record of _when_ and _why_ each call was made.

## ✓ Resolved design questions (were blocking the PRD)

Surfaced during the architecture review on 2026-06-15; all four resolved on 2026-06-16. The PRD is unblocked.

1. ~~**Redemption mechanic (highest priority — core loop is unspecified).**~~ ✓ **Resolved 2026-06-16** — Subtract-the-threshold, confirmed via a **single scan**. One QR scan identifies the Customer; the CafeOwner can issue a Зернятко and/or confirm a Redemption as distinct actions off that one scan (no second scan — refined 2026-06-17). The balance subtracts the threshold (does not reset to 0), so beans toward the next Reward are preserved and a 2× balance can bank multiple Redemptions. See **Redemption** in `CONTEXT.md` and `docs/adr/0006`, `docs/adr/0010`.
2. ~~**"Instant signup reward" vs "credited at first Purchase" contradiction.**~~ ✓ **Resolved 2026-06-16** — Signup Reward postponed out of v1 to the Backlog. Removes the contradiction entirely; revisit after the core loop ships.
3. ~~**Зернятко issuance must not depend on Ворожка.**~~ ✓ **Resolved 2026-06-16** — Confirmed, and the mechanism changed to make it structural: Ворожка is now a daily AI-generated batch served randomly per scan (see AI scope), so the Purchase scan makes **no live AI call at all**. Зернятко issuance is therefore trivially independent of the fortune. Captured as `docs/adr/0009`.
4. ~~**Single-use QR token?**~~ ✓ **Resolved 2026-06-16** — Confirmed single-use. Each rotating token is consumed on first successful scan (by `jti`); re-scans are rejected. Closes the double-issuance / farming window. Captured in `docs/adr/0006`.

## ⚠️ Open design questions (surfaced in the 2026-07-06 review; ✅ resolved at the 2026-07-08 decision sitting)

1. ~~**Staff at the counter**~~ → ✅ **DECIDED** (`docs/adr/0013`, issue #56): café-scoped, time-boxed, revocable **scanner grant**, surfaced first as **«Зміна»** on the barista's own phone (Free tier; default lifetime = end of business day, owner-configurable); «Стійка» kiosk fast-follow; barista may still earn when a colleague scans them (guard generalized to scanner ≠ scanned); nullable `issued_by_user_id` on `purchases`. Spin-offs #61 (flip-QR) and #62 (staff attribution, Pro) stay in the Backlog. Implementation ticket: **#80** (spec frozen 2026-07-10; land after #21 — both touch the scan-rejection taxonomy). Build before pilots.
2. ~~**Account deletion**~~ → ✅ **DECIDED** (`docs/adr/0014`, issue #57): anonymize, never cascade — tombstone the user, keep ledger rows, drop the `on delete cascade`; a CafeOwner deleting their account archives their Café with a warning (deletion never blocked). FK/`archived_at` changes shipped with #22's migration; the deletion flow is implementation ticket **#81** (spec frozen 2026-07-10) — a pre-store slice (#58).
3. ~~**Redemption lock target**~~ → ✅ **DECIDED** (issue #22): #22 creates `cafe_memberships` and serializes earn/redeem per (Customer, Café) with `SELECT … FOR UPDATE` on the membership row, exactly as ADR 0010 planned. Advisory locks rejected (invisible in schema; the table is wanted by #56/#57 anyway).
4. ~~**Member code is core resilience, not an edge case**~~ → ✅ **spec frozen into #21** (2026-07-10): single-endpoint body union on the purchase route, 8-char Crockford code generated lazily, ceiling 3/day per Customer/Café (Kyiv day, Platform-tunable), Redemption untouched. Still the priority order: next slice, before any real-world pilot.

Smaller notes filed where they'll be seen: Ворожка daily batch must anchor on Europe/Kyiv + validate Haiku's Ukrainian first (→ #23 — _validated 2026-07-10: Haiku's Ukrainian slipped even with few-shots; default model amended to Sonnet 5, ADR 0007_), Expo push receipts / `DeviceNotRegistered` token pruning (→ #24, in-slice), and a pilot & store-submission readiness checklist (privacy policy, Play data declarations, Railway backups, domains) as **#58**.
