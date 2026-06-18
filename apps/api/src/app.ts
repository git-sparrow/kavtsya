import { Hono } from "hono";
import type { Clock } from "./clock";
import type { Database } from "./db";
import { registerHealthRoute } from "./routes/health";

/**
 * Everything the app needs from the outside world. Injected (not imported as
 * singletons) so tests can supply a real test database and a frozen clock.
 */
export interface AppDeps {
  db: Database;
  clock: Clock;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  registerHealthRoute(app, deps);
  return app;
}
