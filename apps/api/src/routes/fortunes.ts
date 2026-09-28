import type { Hono } from "hono";
import type { AppDeps } from "../app";
import { markFortuneSeen, pendingFortuneFor } from "../customer-fortunes";
import type { AuthedEnv } from "../require-user";
import { uuidParamSchema } from "./params";

/**
 * The Customer's Ворожка reveal (#23, turn 1): the pending fortune their device
 * polls for, and the «Дякую» that marks it seen. The scan that records the
 * fortune stays in routes/purchases.ts — issuance never waits on the reveal
 * (ADR 0009), so the two live apart.
 */
export function registerFortuneRoutes(
  app: Hono<AuthedEnv>,
  { db }: AppDeps,
): void {
  app.get("/api/me/fortune/pending", async (c) => {
    const user = c.get("user");

    return c.json(await pendingFortuneFor(db, user.id));
  });

  app.post("/api/me/fortune/:id/seen", async (c) => {
    const user = c.get("user");

    // Seen is idempotent and answers 204 whether or not a row matched, so a
    // malformed id lands on that same 204 rather than failing a uuid cast.
    const id = uuidParamSchema.safeParse(c.req.param("id"));
    if (id.success) await markFortuneSeen(db, user.id, id.data);
    return c.body(null, 204);
  });
}
