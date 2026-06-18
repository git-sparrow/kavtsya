import postgres from "postgres";

/** A postgres.js SQL tag — raw SQL, no ORM (ADR 0005). */
export type Database = ReturnType<typeof postgres>;

export function createDb(databaseUrl: string): Database {
  return postgres(databaseUrl, {
    onnotice: () => {}, // silence NOTICE chatter (e.g. "IF EXISTS" warnings)
  });
}
