-- 0012_barista_roster: café-scoped Barista Roster + printed poster join-code
-- (#97, ADR 0013). The Roster is the CafeOwner's persistent trusted-barista
-- list; the poster is the non-secret wall code that starts the daily zero-touch
-- flow. Supersedes the #80 owner-shown invite as the entry mechanism (the
-- invite path itself is retired in #98).
--
-- 1. `cafes.poster_code` — a stable, NON-secret café-scoped join code printed
--    on the wall poster. Security rests on the roster, not this code (ADR 0013):
--    a leaked photo scanned by a stranger only ever raises a pending request
--    that grants nothing. Same 8-char Crockford base32 shape + normalization as
--    the member code (#21), so the typed fallback and on-screen grouping are
--    shared. Minted at café creation; existing Cafés are backfilled here (unique
--    redraw loop), then the column is made NOT NULL.
--
-- 2. `cafe_barista_roster` — the persistent, café-scoped trusted-barista list.
--    States are just rostered / pending / none (no denylist, ADR 0013): a row
--    is `pending` (a raised request) or `rostered` (approved); no row is `none`.
--    `unique (cafe_id, user_id)` makes a request deduped — one pending per
--    account per Café — and `requested_at` is the rate-limit clock against
--    repeat/decline spam. No ON DELETE CASCADE (ADR 0014: deletion tombstones,
--    never rewrites relationships or audit trails).

alter table cafes add column "poster_code" text unique;

-- Backfill existing Cafés with a unique code, redrawing on the (astronomically
-- unlikely) collision — the app's mint loop in `createCafe` mirrors this.
do $$
declare
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  c record;
  code text;
  i int;
begin
  for c in select "id" from cafes where "poster_code" is null loop
    loop
      code := '';
      for i in 1..8 loop
        code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
      end loop;
      begin
        update cafes set "poster_code" = code where "id" = c."id";
        exit;
      exception when unique_violation then
        -- collision with another Café's code: redraw.
      end;
    end loop;
  end loop;
end $$;

alter table cafes alter column "poster_code" set not null;

create table cafe_barista_roster (
  "id" uuid primary key default gen_random_uuid(),
  "cafe_id" uuid not null references cafes ("id"),
  "user_id" text not null references "user" ("id"),
  "status" text not null check ("status" in ('pending', 'rostered')),
  "requested_at" timestamptz not null,
  "approved_at" timestamptz,
  "approved_by" text references "user" ("id"),
  "created_at" timestamptz not null default now(),
  unique ("cafe_id", "user_id")
);

-- The unique (cafe_id, user_id) index already serves the Café-scoped board read
-- (cafe_id is its prefix). This one serves the #98 "is THIS account rostered?"
-- check and the barista's own roster reads, which look up by user_id.
create index cafe_barista_roster_user_idx on cafe_barista_roster ("user_id");
