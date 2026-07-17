-- 0013_poster_shifts: retire the owner-shown invite handshake; a Shift now
-- originates from a rostered barista scanning the Café's wall poster (#98,
-- ADR 0013 contract step). Supersedes #80's invite mechanism entirely.
--
-- 1. `cafe_shift_invites` is dropped — the create/accept-invite endpoints and
--    their table are gone. The grant is no longer minted from an invite row.
--
-- 2. `cafe_scanner_grants.invite_jti` is dropped (with its unique constraint).
--    A grant is now created directly by the poster-scan of a rostered account
--    (or the owner); `created_by` records who started the shift — the barista
--    themselves, not an owner-issued invite.
--
-- The grants table otherwise stands: `cafe_id`, `user_id`, `expires_at`
-- (now a rolling ~16h cap set in app code, #99, not a Kyiv-midnight ceiling),
-- `revoked_at` (owner board-end, removal-termination, or self-end), and the
-- `(user_id, cafe_id)` / `(cafe_id)` read indexes. No ON DELETE CASCADE stays
-- the rule (ADR 0014).

alter table cafe_scanner_grants drop column "invite_jti";

drop table cafe_shift_invites;
