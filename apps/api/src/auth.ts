import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import type { Pool } from "pg";

/**
 * Better Auth instance type. Derived from `createAuth` (not `betterAuth`
 * directly) so it carries our exact plugin/option set — the generic default
 * `betterAuth` return type is too loose to assign our instance to. Built
 * per-process (and per-test) so the connection and secret are injected, not
 * imported as a singleton — mirroring how the app takes `db` and `clock`.
 */
export type Auth = ReturnType<typeof createAuth>;

/** The session payload Better Auth resolves from a request's cookies. */
type Resolved = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
export type AuthUser = Resolved["user"];
export type AuthSession = Resolved["session"];

export interface AuthOptions {
  /**
   * A node-postgres Pool. Better Auth owns its auth tables (user, session,
   * account, verification) through this connection; the rest of the app keeps
   * using postgres.js (ADR 0005). Better Auth has no postgres.js adapter, so a
   * pg Pool against the same database is the supported integration.
   */
  database: Pool;
  secret: string;
  baseURL: string;
  /**
   * Origins allowed to hold a session. The mobile app talks to the API over its
   * custom scheme (`kavtsya://`) and, in Expo dev, over `exp://`.
   */
  trustedOrigins?: string[];
}

export function createAuth({
  database,
  secret,
  baseURL,
  trustedOrigins = ["kavtsya://", "exp://"],
}: AuthOptions) {
  return betterAuth({
    database,
    secret,
    baseURL,
    basePath: "/api/auth",
    emailAndPassword: { enabled: true },
    // Expo plugin handles the native cookie/secure-store session and adds the
    // app scheme to the OAuth/redirect allow-list.
    plugins: [expo()],
    trustedOrigins,
  });
}
