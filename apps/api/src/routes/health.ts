import type { Hono } from "hono";
import type { HealthResponse } from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import { todaysPool } from "../fortunes";

export function registerHealthRoute(
  app: Hono<AppEnv>,
  { db, clock }: AppDeps,
): void {
  app.get("/health", async (c) => {
    // Touch the database so /health fails loudly if the connection is down.
    await db`select 1`;
    const body: HealthResponse = {
      status: "ok",
      db: "ok",
      time: clock.now().toISOString(),
      // Surface today's Ворожка pool (#116): the scan falls back silently on an
      // empty pool (ADR 0009), so a failed generation job is otherwise invisible.
      fortunePool: await todaysPool(db, clock),
    };
    return c.json(body);
  });
}
