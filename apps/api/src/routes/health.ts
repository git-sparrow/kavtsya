import type { Hono } from "hono";
import type { HealthResponse } from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";

export function registerHealthRoute(app: Hono<AppEnv>, { db, clock }: AppDeps): void {
  app.get("/health", async (c) => {
    // Touch the database so /health fails loudly if the connection is down.
    await db`select 1`;
    const body: HealthResponse = {
      status: "ok",
      db: "ok",
      time: clock.now().toISOString(),
    };
    return c.json(body);
  });
}
