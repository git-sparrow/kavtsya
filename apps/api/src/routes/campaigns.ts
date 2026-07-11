import type { Hono } from "hono";
import { z } from "zod";
import type { CampaignRejection, CampaignResult } from "@kavtsya/shared";
import {
  campaignRejectionStatuses,
  sendCampaignBodySchema,
} from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import type { SendCampaignRejection } from "../campaigns";
import { sendCampaign } from "../campaigns";

/** Café ids are uuids; a malformed id is simply "not found" (and avoids a DB cast error). */
const cafeIdSchema = z.string().uuid();

/** The one place a domain reason picks its wire code, as the scan does (#50). */
const wireCodes: Record<SendCampaignRejection, CampaignRejection> = {
  cafe_not_owned: "not_found",
  pro_required: "pro_required",
  campaign_limit_reached: "campaign_limit_reached",
};

/**
 * The Pro CafeOwner's campaign send (#24, ADR 0011): one tap, one push to the
 * Café's recently-active consenting Customers, one append-only ledger row.
 * The Plan gate answers a Free café with the upgrade code — the mobile pitch
 * renders off it.
 */
export function registerCampaignRoutes(
  app: Hono<AppEnv>,
  { db, clock, pushProvider }: AppDeps,
): void {
  app.post("/api/cafes/:id/campaigns", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const cafeId = cafeIdSchema.safeParse(c.req.param("id"));
    if (!cafeId.success) return c.json({ error: "not_found" }, 404);

    const parsed = sendCampaignBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid_campaign" }, 400);

    const outcome = await sendCampaign(db, clock, pushProvider, {
      cafeId: cafeId.data,
      ownerUserId: user.id,
      message: parsed.data.message,
    });
    if (!outcome.ok) {
      const code = wireCodes[outcome.reason];
      return c.json({ error: code }, campaignRejectionStatuses[code]);
    }

    const body: CampaignResult = { recipients: outcome.recipients };
    return c.json(body, 201);
  });
}
