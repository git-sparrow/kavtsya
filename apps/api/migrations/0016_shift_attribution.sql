-- 0016_shift_attribution: the read indexes the owner's shift board needs (#137,
-- redesign turn 5c). The board enriches each shift with a scan tally and lists
-- the shifts that closed today — both new read patterns over existing columns;
-- no table or column changes (attribution already rides `issued_by_user_id`
-- from 0010, and the shift window is `created_at`/`expires_at`/`revoked_at`).
--
-- 1. Per-shift scan count attributes Зернятка by who issued them at a Café, in a
--    time window: `(issued_by_user_id, cafe_id, created_at)`. The existing
--    purchase indexes lead with the Customer or the Café, so a per-issuer window
--    scan can't use them; this one leads with the issuer and orders by time.
--
-- 2. «Завершені сьогодні» reads closed grants by Café ordered by their end
--    instant. The existing `cafe_scanner_grants_cafe_idx` serves the active
--    read; add the end-ordered form so the completed slice is index-covered too.

create index purchases_issuer_cafe_time_idx
  on purchases ("issued_by_user_id", "cafe_id", "created_at");

create index cafe_scanner_grants_cafe_expiry_idx
  on cafe_scanner_grants ("cafe_id", "expires_at");
