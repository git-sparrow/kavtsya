-- 0014_analytics: the ledger index analytics reads need (#25, ADR 0010/0011).
--
-- Analytics is derived live from the Purchase ledger (ADR 0010 — the ledger IS
-- the analytics source): every read slices one Café's purchases by a Kyiv-day
-- period, then buckets by hour and splits new/repeat Customers. The existing
-- `purchases_customer_cafe_idx` leads with the Customer, so a per-Café period
-- scan can't use it; this index leads with the Café and orders by time, which
-- both the period slice and the per-Customer first-visit derivation ride on.
--
-- No table or column changes — analytics adds no new state (the Active Customer
-- metric lives only in the read layer, never as a stored flag, #25).

create index purchases_cafe_time_idx on purchases ("cafe_id", "created_at");
