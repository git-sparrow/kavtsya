-- 0008_fortunes: the daily Ворожка pool (#23, ADR 0007 / ADR 0009).
--
-- A scheduled job generates a batch of generic coffee fortunes once per day
-- through the AIProvider; each Purchase scan reads one at random from the
-- current day's rows. The scan never calls the model — Зернятко issuance can
-- never wait on (or fail with) an AI service.
--
-- `pool_day` is the Europe/Kyiv calendar day the batch belongs to, computed in
-- application code from the injected clock: the pool rolls over at Kyiv
-- midnight, not at server/UTC midnight, so it doesn't flip mid-evening for
-- Ukrainian cafés.

create table fortunes (
  "id" uuid primary key default gen_random_uuid(),
  "pool_day" date not null,
  "text" text not null,
  "created_at" timestamptz not null default now()
);

-- The scan's only query: random row within one day's pool.
create index fortunes_pool_day_idx on fortunes ("pool_day");
