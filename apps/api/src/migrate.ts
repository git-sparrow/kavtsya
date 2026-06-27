import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./db";

export const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

/**
 * Apply any not-yet-applied `*.sql` migrations in filename order, each in its
 * own transaction, tracking applied names in `schema_migrations`. Idempotent:
 * safe to run on every boot and from the test harness.
 */
export async function runMigrations(
  db: Database,
  dir: string = MIGRATIONS_DIR,
): Promise<void> {
  await db`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const appliedRows = await db<
    { name: string }[]
  >`select name from schema_migrations`;
  const applied = new Set(appliedRows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;
    const contents = await readFile(join(dir, file), "utf8");
    await db.begin(async (tx) => {
      // .simple() allows multiple statements per migration file.
      await tx.unsafe(contents).simple();
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`migrated ${file}`);
  }
}
