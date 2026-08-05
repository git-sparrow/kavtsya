import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The two cross-run concerns of a persistent test database, one file each:
    // reset `platform_config` to its shipped defaults before the run so a leak
    // from the last one can't poison this one (#114), and — after every suite
    // has exercised the shared ledger — assert no derived balance went
    // negative, the cross-suite invariant from ADR 0010 (#115).
    globalSetup: ["test/global-config-reset.ts", "test/global-invariant.ts"],
    // Integration tests share a single real Postgres database, so run them
    // serially to avoid cross-test interference.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
