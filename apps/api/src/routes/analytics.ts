import type { Hono } from "hono";
import { z } from "zod";
import type { AnalyticsRejection } from "@kavtsya/shared";
import {
  analyticsPeriodSchema,
  analyticsRejectionStatuses,
} from "@kavtsya/shared";
import { getCafeAnalytics } from "../analytics";
import type { AnalyticsRejectionReason } from "../analytics";
import type { AppDeps, AppEnv } from "../app";

/** Café ids are uuids; a malformed id is simply "not found" (and avoids a DB cast error). */
const cafeIdSchema = z.string().uuid();

/** The one place a domain reason picks its wire code, as the campaign gate does (#50). */
const wireCodes: Record<AnalyticsRejectionReason, AnalyticsRejection> = {
  cafe_not_owned: "not_found",
  pro_required: "pro_required",
};

/**
 * CafeOwner analytics (#25, ADR 0011): one Pro-gated read per Café — peak hours
 * plus the repeat-vs-new split over a `7d`/`30d` window (default `30d`). Gating
 * reuses #24's `pro_required` code, so a Free café's read answers with the same
 * upgrade signal the campaigns screen renders off.
 */
export function registerAnalyticsRoutes(
  app: Hono<AppEnv>,
  { db, clock }: AppDeps,
): void {
  app.get("/api/cafes/:id/analytics", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const cafeId = cafeIdSchema.safeParse(c.req.param("id"));
    if (!cafeId.success) return c.json({ error: "not_found" }, 404);

    // Presets only — an absent or unknown period falls back to the default 30d
    // rather than 400-ing; the toggle only ever sends a valid preset (#25).
    const period =
      analyticsPeriodSchema.safeParse(c.req.query("period")).data ?? "30d";

    const outcome = await getCafeAnalytics(db, clock, {
      cafeId: cafeId.data,
      ownerUserId: user.id,
      period,
    });
    if (!outcome.ok) {
      const code = wireCodes[outcome.reason];
      return c.json({ error: code }, analyticsRejectionStatuses[code]);
    }
    return c.json(outcome.summary);
  });
}
