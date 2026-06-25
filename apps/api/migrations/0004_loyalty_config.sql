-- 0004_loyalty_config: per-Café loyalty program + Platform-tunable config (#18).
--
-- Two things land here:
--
-- 1. `platform_config` — a key/value store the Platform owns (CONTEXT → Platform,
--    story 38). Business-level config (the default Reward set now; the QR token
--    grace window, Pro gating, and pricing later) lives in rows here so it is
--    tunable *without a code deploy*. The default Reward set is seeded below and
--    read from this table — no hardcoded list in the API.
--
-- 2. The loyalty program columns on `cafes`. Each Café runs its own independent
--    program (CONTEXT → Café): a Зернятко `threshold` (default 10) and a chosen
--    `reward`. They live on `cafes` because the program is strictly 1:1 with the
--    Café in v1 — every Café has a threshold the moment it is registered (the
--    column default backfills existing rows), and the Reward is null until the
--    CafeOwner picks one. The `reward` JSON shape is validated by Zod in the API
--    (free_drink | free_specific_drink | fixed_discount | percent_discount).
--
-- Config changes apply going forward only. Redemption snapshots the threshold at
-- confirm time (enforced in the Redemption slice, #22), so nothing here ever
-- re-prices a past Redemption.

create table platform_config (
  "key" text primary key,
  "value" jsonb not null,
  "updated_at" timestamptz not null default now()
);

-- The platform-default Reward set every Café (Free or Pro) chooses from
-- (CONTEXT → Reward). Adding a new default later is a row update, not a deploy.
insert into platform_config ("key", "value") values (
  'reward_defaults',
  '[
    { "type": "free_drink",          "label": "Безкоштовний напій" },
    { "type": "free_specific_drink", "label": "Безкоштовний обраний напій" },
    { "type": "fixed_discount",      "label": "Фіксована знижка" },
    { "type": "percent_discount",    "label": "Відсоткова знижка" }
  ]'::jsonb
);

alter table cafes
  add column "zernyatko_threshold" integer not null default 10
    check ("zernyatko_threshold" > 0),
  add column "reward" jsonb;
