import { runSeed, seedWorld, wipeAll } from "./seed-world";

/**
 * Clean-slate reseed: truncate every data table (keeping schema, migrations,
 * and platform_config), then create the defined demo world from scratch. Use
 * this to clear accreted junk from past verify runs without a full `db:reset`
 * (which drops and re-migrates the volume). Destructive — LOCAL dev only.
 */
await runSeed(async (db, auth) => {
  await wipeAll(db);
  await seedWorld(db, auth);
});
