-- 0006_purchases: the append-only Зернятко ledger (#20, ADR 0010).
--
-- One row per Зернятко earned — recorded when the CafeOwner scans the
-- Customer's QR (CONTEXT → Purchase). Balance is never stored: it is derived
-- as count(purchases) − sum(redemptions.beans_spent) per (Customer, Café), so
-- the ledger keeps the history that analytics, churn (v2), and Redemption
-- safety all need. Rows are only ever inserted; there is no update path.
--
-- `qr_jti` is the scanned token's unique id (ADR 0006): the unique constraint
-- makes earning single-use — the consumed-token check and the Зернятко
-- issuance are the same write, so a re-scan or double-tap can never issue two.

create table purchases (
  "id" uuid primary key default gen_random_uuid(),
  "cafe_id" uuid not null references cafes ("id") on delete cascade,
  "customer_user_id" text not null references "user" ("id") on delete cascade,
  "qr_jti" text not null unique,
  "created_at" timestamptz not null default now()
);

-- Balance derivation reads one (Customer, Café) pair; the Customer's Café list
-- groups by the same leading column.
create index purchases_customer_cafe_idx
  on purchases ("customer_user_id", "cafe_id");
