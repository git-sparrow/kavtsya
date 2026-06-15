# Raw SQL over an ORM

We write plain SQL using the `postgres.js` driver rather than an ORM (Drizzle, Prisma, etc.).

The data model is straightforward and the project's learning goals include backend fundamentals. An ORM would abstract away the SQL, which is the opposite of what we want. Raw SQL also removes a dependency, keeps queries readable, and avoids ORM-specific gotchas (N+1 queries hidden behind relations, migration conflicts). Schema migrations are managed with numbered `.sql` files and a simple runner.

This is a deliberate trade-off: more boilerplate per query, but full understanding and control of every database operation.
