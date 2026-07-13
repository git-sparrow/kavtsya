import type { Hono } from "hono";
import { z } from "zod";
import type {
  AcceptShiftInviteResult,
  MyShiftResponse,
  ShiftInviteResponse,
  ShiftsResponse,
} from "@kavtsya/shared";
import {
  acceptShiftInviteBodySchema,
  openShiftInviteBodySchema,
  shiftInviteRejectionStatuses,
} from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import {
  acceptShiftInvite,
  activeShiftFor,
  endMyShift,
  listActiveShifts,
  openShiftInvite,
  revokeShiftGrant,
} from "../shifts";

/** Café ids are uuids; a malformed id is simply "not found" (and avoids a DB cast error). */
const cafeIdSchema = z.string().uuid();

/**
 * «Зміна» over the wire (#80, ADR 0013): the CafeOwner opens a shift and gets
 * the invite to show; «Запросити ще» is simply opening another. Owner-side
 * routes require ownership of the Café, enforced by the ownership-scoped
 * queries in `../shifts` — same semantics as the loyalty config routes.
 */
export function registerShiftRoutes(
  app: Hono<AppEnv>,
  { db, clock, qrTokenSecret }: AppDeps,
): void {
  app.post("/api/cafes/:id/shift-invites", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const cafeId = cafeIdSchema.safeParse(c.req.param("id"));
    if (!cafeId.success) return c.json({ error: "not_found" }, 404);

    // The body is optional (default shift = the rest of the business day) —
    // absent reads as {}; present-but-unparseable is the client's bug.
    const raw = await c.req.text();
    let body: unknown = {};
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        return c.json({ error: "invalid_shift_invite" }, 400);
      }
    }
    const parsed = openShiftInviteBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_shift_invite" }, 400);

    const outcome = await openShiftInvite(db, clock, {
      cafeId: cafeId.data,
      ownerUserId: user.id,
      durationMinutes: parsed.data.durationMinutes,
      secret: qrTokenSecret,
    });
    if (!outcome.ok) return c.json({ error: "not_found" }, 404);

    const responseBody: ShiftInviteResponse = {
      inviteToken: outcome.inviteToken,
      inviteCode: outcome.inviteCode,
      inviteExpiresAt: outcome.inviteExpiresAt.toISOString(),
      grantExpiresAt: outcome.grantExpiresAt.toISOString(),
    };
    return c.json(responseBody, 201);
  });

  // The barista's side of the handshake: their own authenticated account
  // presents the invite (scanned token or typed code) and gains the shift.
  app.post("/api/shift-invites/accept", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const parsed = acceptShiftInviteBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: "invalid_shift_invite" }, 400);

    const outcome = await acceptShiftInvite(db, clock, {
      userId: user.id,
      invite:
        "inviteToken" in parsed.data
          ? { source: "token", token: parsed.data.inviteToken }
          : { source: "code", code: parsed.data.inviteCode },
      secret: qrTokenSecret,
    });
    // The domain reasons ARE the wire taxonomy here — no renaming to map.
    if (!outcome.ok) {
      return c.json(
        { error: outcome.reason },
        shiftInviteRejectionStatuses[outcome.reason],
      );
    }

    const responseBody: AcceptShiftInviteResult = {
      cafeId: outcome.cafeId,
      cafeName: outcome.cafeName,
      expiresAt: outcome.expiresAt.toISOString(),
    };
    return c.json(responseBody, 201);
  });

  // The owner's shift board: who is behind the counter right now.
  app.get("/api/cafes/:id/shifts", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const cafeId = cafeIdSchema.safeParse(c.req.param("id"));
    if (!cafeId.success) return c.json({ error: "not_found" }, 404);

    const shifts = await listActiveShifts(
      db,
      cafeId.data,
      user.id,
      clock.now(),
    );
    if (!shifts) return c.json({ error: "not_found" }, 404);

    const responseBody: ShiftsResponse = shifts.map((shift) => ({
      id: shift.id,
      baristaName: shift.baristaName,
      expiresAt: shift.expiresAt.toISOString(),
    }));
    return c.json(responseBody);
  });

  // Revocation is a tap: the grant dies now instead of at closing time.
  app.delete("/api/cafes/:id/shifts/:grantId", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const cafeId = cafeIdSchema.safeParse(c.req.param("id"));
    const grantId = cafeIdSchema.safeParse(c.req.param("grantId"));
    if (!cafeId.success || !grantId.success) {
      return c.json({ error: "not_found" }, 404);
    }

    const revoked = await revokeShiftGrant(
      db,
      cafeId.data,
      grantId.data,
      user.id,
      clock.now(),
    );
    if (!revoked) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  // The barista ends their OWN shift (#96, ADR 0015): «Завершити зміну» drops
  // them out of the near-kiosk Scanner Mode. Self-authorized and idempotent —
  // a double-tap or a caller with no active shift is a no-op, always 204.
  app.delete("/api/me/shift", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    await endMyShift(db, user.id, clock.now());
    return c.body(null, 204);
  });

  // The barista's side: "am I on shift?" — scanner mode's scope + banner expiry.
  app.get("/api/me/shift", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const shift = await activeShiftFor(db, user.id, clock.now());
    const responseBody: MyShiftResponse = {
      shift: shift && {
        cafeId: shift.cafeId,
        cafeName: shift.cafeName,
        expiresAt: shift.expiresAt.toISOString(),
      },
    };
    return c.json(responseBody);
  });
}
