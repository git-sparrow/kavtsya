# Raw SQL over an ORM

We write plain SQL using the `postgres.js` driver rather than an ORM (Drizzle, Prisma, etc.).

The data model is straightforward and the project's learning goals include backend fundamentals. An ORM would abstract away the SQL, which is the opposite of what we want. Raw SQL also removes a dependency, keeps queries readable, and avoids ORM-specific gotchas (N+1 queries hidden behind relations, migration conflicts). Schema migrations are managed with numbered `.sql` files and a simple runner.

This is a deliberate trade-off: more boilerplate per query, but full understanding and control of every database operation.

## Sanctioned exception: Better Auth (issue #16)

Better Auth (the chosen auth library) has no `postgres.js` adapter and uses a `pg` Pool + Kysely internally for its own four tables (`user`, `session`, `account`, `verification`). This is consistent with the spirit of this ADR: the project writes **zero** SQL against those vendor-owned tables, and their schema still lives in a hand-written numbered `.sql` migration under our own runner — not the Better Auth CLI migrator — so there remains one source of truth for schema. The cost is a second connection pool to the same database. All **project-owned** domain tables (the event ledger, cafés, memberships, …) stay on raw SQL via `postgres.js`.
