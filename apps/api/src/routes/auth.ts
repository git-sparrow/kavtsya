import type { Hono } from "hono";
import type { MeResponse, OwnerCafe } from "@kavtsya/shared";
import { deleteAccount, deletionPreview } from "../account-deletion";
import { countReturningCustomers } from "../analytics";
import type { AppDeps, AppEnv } from "../app";
import { listCafesByOwner, rolesFor } from "../cafes";
import { pushConsentFor } from "../push-tokens";

/**
 * App-owned routes that depend on an authenticated session. Better Auth's own
 * endpoints live under /api/auth/*; this is where our domain reads the session.
 */
export function registerAuthRoutes(
  app: Hono<AppEnv>,
  { db, clock }: AppDeps,
): void {
  // The account foundation every later slice builds on: who am I? Returns 401
  // when no valid session cookie is present. `roles`/`cafes` let the mobile app
  // decide whether to offer CafeOwner Mode (ADR 0003).
  app.get("/api/me", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    // Each owned Café carries its one free teaser stat (#25, ADR 0011): how many
    // Customers came back in the last 30 Kyiv days — the single permanent free
    // number, riding on this existing read for Free and Pro owners alike.
    const cafes = await listCafesByOwner(db, user.id);
    const ownerCafes: OwnerCafe[] = await Promise.all(
      cafes.map(async (cafe) => ({
        ...cafe,
        returningCustomers30d: await countReturningCustomers(
          db,
          clock,
          cafe.id,
        ),
      })),
    );
    const body: MeResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: rolesFor(ownerCafes),
      cafes: ownerCafes,
      // Custom column, not a Better Auth field — read from our side (#24).
      pushConsent: await pushConsentFor(db, user.id),
    };
    return c.json(body);
  });

  // What deletion would cost, read before the account is asked to confirm it
  // (#81, #143 screens 6b/7d). A pure read: the account may look and stay.
  app.get("/api/me/deletion-preview", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    return c.json(await deletionPreview(db, user.id));
  });

  // In-app account deletion (#81, ADR 0014, App Store Guideline 5.1.1(v)):
  // tombstone the account, archive the Cafés it owns. Never blocked — not by
  // owning a Café (ADR 0014 rejected requiring a transfer first; that stays
  // post-v1, #160) and not by anything else, because a legally required exit
  // that can be refused is not an exit. Permanent and immediate: 204, and by
  // the time it returns the session that sent it no longer exists.
  app.delete("/api/me", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    await deleteAccount(db, user.id, clock.now());
    return c.body(null, 204);
  });
}
