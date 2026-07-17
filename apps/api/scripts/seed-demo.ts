import { runSeed, seedWorld } from "./seed-world";

/**
 * Seed the LOCAL dev database with the defined demo world (see `seed-world.ts`
 * for the account roster). Additive and idempotent: existing accounts and
 * ledger rows are kept, only the demo fixtures are pinned to known values — so
 * it is safe to re-run any time, including mid-demo. Run it after `db:reset`,
 * or use `seed-demo-fresh` to also clear accreted junk first.
 */
await runSeed(seedWorld);
