import postgres from "postgres";

/** A postgres.js SQL tag — raw SQL, no ORM (ADR 0005). */
export type Database = ReturnType<typeof postgres>;

/**
 * What query functions accept: the root client or a `db.begin` transaction —
 * so a read like `balanceFor` can run inside a write's transaction (#22).
 * (postgres.js types `TransactionSql` as its own thing, not a `Sql` subtype.)
 */
export type Queryable = Database | postgres.TransactionSql;

/**
 * A named piece of SQL meant to be interpolated into a bigger query rather than
 * run on its own — how a rule that several queries share gets exactly one home
 * (the Kyiv-day predicate, the active-grant predicate) while staying visible raw
 * SQL, not an ORM (ADR 0005).
 */
export type SqlFragment = postgres.Fragment;

/**
 * Whether an error is Postgres signalling a unique-constraint conflict — the
 * write paths lean on unique indexes as their guards (single-use `qr_jti`,
 * the Redemption idempotency key), so this is how a duplicate announces itself.
 * postgres.js surfaces Postgres errors with the SQLSTATE in `code`.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === "23505";
}

export function createDb(databaseUrl: string): Database {
  return postgres(databaseUrl, {
    onnotice: () => {}, // silence NOTICE chatter (e.g. "IF EXISTS" warnings)
  });
}
