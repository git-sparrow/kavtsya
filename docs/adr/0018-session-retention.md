# Expired sessions are deleted within 30 days; IP tracking stays on

Decided 2026-09-29 (#254). Better Auth stores the client's **IP address** and **user agent** on every `session` row (`migrations/0002_auth.sql`). Better Auth deletes an expired row only lazily, when a client presents that expired cookie (`dist/api/routes/session.mjs`, `better-auth@1.7.5`, read 2026-09-29). A session whose cookie never comes back was kept forever: an uninstalled app, a replaced phone, a signed-in-elsewhere device. On mobile, where people close the app rather than sign out, that is the normal path. Every session a Customer ever opened would have left a permanent record of where they were and which device they used. An IP address is personal data (GDPR Art. 4(1), *Breyer* C-582/14; Ukraine's Law On Personal Data Protection), and keeping it indefinitely with no stated purpose fails storage limitation (GDPR Art. 5(1)(e)).

## Decision

**No expired session outlives `expiresAt` by more than 30 days**. The row is deleted, and its IP address and user agent go with it. A daily job enforces this: `pnpm --filter ./apps/api prune-expired-sessions` (`apps/api/src/session-retention.ts`). It is built for the same Railway cron rig as the Ворожка batch and `prune-push-receipts`; none of them is scheduled yet (see Consequences).

- **Why 30 days rather than deleting on expiry.** The one legitimate use of the IP and user agent is answering "was my account accessed?". It covers a Customer who reports something odd a few weeks late, or a CafeOwner whose account scans for a Café. Deleting on expiry would destroy that evidence before anyone thinks to ask. A longer window would serve no purpose we can name. The 30 days is an upper bound, not a guarantee: if the owner's own device presents the expired cookie, Better Auth deletes that row at once. That costs nothing, because the sessions worth investigating are the ones whose cookie is *not* coming back from the owner's device.
- **What the job may touch.** It deletes only from `session`, and only rows whose `expiresAt` is more than 30 days in the past. A live session is outside the predicate by construction. Nothing references a session row, so the delete cannot cascade, and it never touches `user` or the ledger (ADR 0010, ADR 0014). It is idempotent, so a cron retry is harmless. This is raw SQL against a Better Auth table, the second such write after account deletion. ADR 0005's Better Auth exception is amended to allow deletes.
- **Account deletion is unchanged.** It already removes all of the user's sessions immediately (ADR 0014, `account-deletion.ts`). This policy covers the accounts that stay.

## We keep collecting the IP

Better Auth can be told not to record IPs (`advanced.ipAddress.disableIpTracking`). We do not set it, because its auth rate limiter keys on the client IP. In the installed `better-auth@1.7.5` (read `@better-auth/core` `dist/utils/ip.mjs` and `better-auth` `dist/api/rate-limiter/index.mjs` on 2026-09-29), disabling tracking makes `getIP` return nothing for *every* request, and the rate limiter then **skips rate limiting entirely**. So sign-in brute-force protection would be switched off, not merely weakened. (With tracking on but no IP resolved, it falls back to a single shared bucket per path. That weaker case is why the Railway deploy must forward the client IP, #65.) Collecting the IP and pruning it after a bounded window keeps that protection and still bounds retention.

The **user agent** has no such consumer and could be dropped. We keep it for the same forensics window: "a new iPhone signed in" is the most useful line in an account-access answer. It lives on the same row and is deleted on the same schedule.

## Consequences

- Railway must run the job daily in production. Scheduling it is a checklist item on #65 (production provisioning), alongside the Ворожка batch and `prune-push-receipts`. Until that lands, no retention job runs anywhere, because production does not exist yet.
- The window is one constant, `SESSION_RETENTION_DAYS`. Changing it means changing that constant and this ADR together, and the privacy policy (#58) must quote the same number.
- If we ever use the IP for something new (fraud scoring, geo analytics), that is a new purpose. It needs its own decision and does not come free with this retention window.
