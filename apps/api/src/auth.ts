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
   * Production trusts only the app's own scheme. Elsewhere Expo Go's `exp://`
   * is trusted too, so the app can sign in from a dev build.
   */
  production: boolean;
}

export function createAuth({
  database,
  secret,
  baseURL,
  production,
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
    trustedOrigins: production ? ["kavtsya://"] : ["kavtsya://", "exp://"],
    // IP tracking stays on (no `advanced.ipAddress.disableIpTracking`): the
    // auth rate limiter keys on it (checked against 1.7.5, see ADR 0018).
    // Expired sessions carrying the IP are deleted after
    // `SESSION_RETENTION_DAYS` by `session-retention.ts`.
    // Railway's edge sets the client IP in `X-Real-IP`; the default
    // `x-forwarded-for` would leave every client in one rate-limit bucket.
    advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip"] } },
  });
}

/**
 * `exp://` matches any host, and the Expo plugin hands the session cookie to a
 * trusted non-web redirect — so a production process that trusts it, by any
 * route (`BETTER_AUTH_TRUSTED_ORIGINS`, a plugin), must refuse to start.
 */
export async function assertProductionOrigins(auth: Auth): Promise<void> {
  const { trustedOrigins } = await auth.$context;
  const expoGo = trustedOrigins.filter((o) => o.startsWith("exp://"));
  if (expoGo.length > 0) {
    throw new Error(
      `Production must not trust Expo Go origins: ${expoGo.join(", ")}`,
    );
  }
}
