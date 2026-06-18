import { createDb } from "../src/db";
import { loadDotEnv, loadEnv } from "../src/env";
import { runMigrations } from "../src/migrate";

loadDotEnv();
const env = loadEnv();
const db = createDb(env.DATABASE_URL);

try {
  await runMigrations(db);
  console.log("migrations up to date");
} finally {
  await db.end();
}
