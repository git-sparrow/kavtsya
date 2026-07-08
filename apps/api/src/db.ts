import postgres from "postgres";

/** A postgres.js SQL tag — raw SQL, no ORM (ADR 0005). */
export type Database = ReturnType<typeof postgres>;

/**
 * What query functions accept: the root client or a `db.begin` transaction —
 * so a read like `balanceFor` can run inside a write's transaction (#22).
 * (postgres.js types `TransactionSql` as its own thing, not a `Sql` subtype.)
 */
export type Queryable = Database | postgres.TransactionSql;

export function createDb(databaseUrl: string): Database {
  return postgres(databaseUrl, {
    onnotice: () => {}, // silence NOTICE chatter (e.g. "IF EXISTS" warnings)
  });
}
