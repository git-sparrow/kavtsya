-- 0018_push_token_session: a push token reaches its account only while the
-- session that registered it is alive (#330).
--
-- Before this, nothing on sign-out touched `push_tokens`, so a signed-out phone
-- kept receiving that account's campaigns and roster pushes until another
-- account re-registered the device. Binding the token to its session makes
-- sign-out stop delivery with no client cooperation:
--
-- 1. `push_tokens."session_id"`: the session that last registered the token.
--    `on delete set null`, because Better Auth deletes the session row on
--    sign-out and the token row must survive it (`push_tickets` references
--    it). A null session never delivers.
--
-- 2. `deliverable_push_tokens`: the one definition of "this token may be sent
--    to": active (Expo has not reported it gone) and its session is live.
--    The expiry check covers a sign-out the server never heard about (an
--    offline phone): the abandoned session expires and delivery stops then.
--    `now()` and not the app clock, because Better Auth judges `expiresAt`
--    against real time too.
--
-- Tokens registered before this migration have no session and stop
-- delivering. The app re-registers a consenting account's token on every
-- launch, which binds it to the current session.

alter table push_tokens
  add column "session_id" text references "session" ("id") on delete set null;

create view deliverable_push_tokens as
  select t.*
  from push_tokens t
  join "session" s on s."id" = t."session_id"
  where t."active" and s."expiresAt" > now();
