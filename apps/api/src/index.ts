import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { systemClock } from "./clock";
import { createDb } from "./db";
import { loadDotEnv, loadEnv } from "./env";

loadDotEnv();
const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app = createApp({ db, clock: systemClock });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Kavtsya API listening on http://localhost:${info.port}`);
});
