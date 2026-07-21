-- 0015_customer_fortunes: the Customer's own Ворожка reveals (#23, redesign turn 1).
--
-- The reveal moved from the barista's screen onto the Customer's device: each
-- scan draws a fortune from the daily pool (0008_fortunes) and records it HERE,
-- against the Customer and the Café, so their phone can reveal it moments later
-- (it polls for the most recent unseen one, then marks it seen). This is also
-- the start of the "історія Ворожки" — the fortunes a Customer has received.
--
-- One row per Purchase's fortune; append-only except for `seen_at`, set once
-- when the Customer taps «Дякую». The fortune text is snapshotted (not a pool
-- reference) so a reveal is stable even after the daily pool rolls over.

create table customer_fortunes (
  "id" uuid primary key default gen_random_uuid(),
  "customer_user_id" text not null references "user" ("id") on delete cascade,
  "cafe_id" uuid not null references cafes ("id") on delete cascade,
  "fortune" text not null,
  "created_at" timestamptz not null default now(),
  "seen_at" timestamptz
);

-- The only hot read: this Customer's most recent UNSEEN fortune. A partial index
-- on the unseen rows keeps it cheap as revealed history accumulates.
create index customer_fortunes_pending_idx
  on customer_fortunes ("customer_user_id", "created_at" desc)
  where "seen_at" is null;
