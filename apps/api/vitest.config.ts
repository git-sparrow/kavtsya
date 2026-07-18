import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // After every suite has exercised the shared ledger, assert no derived
    // balance went negative — the cross-suite invariant from ADR 0010 (#115).
    globalSetup: ["test/global-invariant.ts"],
    // Integration tests share a single real Postgres database, so run them
    // serially to avoid cross-test interference.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
