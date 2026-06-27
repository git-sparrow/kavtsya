import { createDb } from "../src/db";
import { loadDatabaseUrl, loadDotEnv } from "../src/env";
import { runMigrations } from "../src/migrate";

loadDotEnv();
const db = createDb(loadDatabaseUrl());

try {
  await runMigrations(db);
  console.log("migrations up to date");
} finally {
  await db.end();
}
