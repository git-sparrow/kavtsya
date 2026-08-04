import { serve } from "@hono/node-server";
import { Pool } from "pg";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { systemClock } from "./clock";
import { createDb } from "./db";
import { loadDotEnv, loadEnv } from "./env";
import { createPlatformConfig } from "./platform-config";
import { createPushProvider } from "./push";

loadDotEnv();
const env = loadEnv();
const db = createDb(env.DATABASE_URL);
// Better Auth needs its own pg Pool against the same database (no postgres.js
// adapter); the rest of the app keeps using `db` (postgres.js).
const authPool = new Pool({ connectionString: env.DATABASE_URL });
const auth = createAuth({
  database: authPool,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
});
const app = createApp({
  db,
  clock: systemClock,
  auth,
  qrTokenSecret: env.QR_TOKEN_SECRET,
  // Expo push (#24) — no required env: unauthenticated sends unless the
  // account enables enhanced security (then EXPO_ACCESS_TOKEN applies).
  pushProvider: createPushProvider(),
  // One config reader for the process — its cache lives as long as the app.
  platformConfig: createPlatformConfig(db, systemClock),
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Kavtsya API listening on http://localhost:${info.port}`);
});
