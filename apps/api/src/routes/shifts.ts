import type { Hono } from "hono";
import type { MyShiftResponse, ShiftsResponse } from "@kavtsya/shared";
import type { AppDeps } from "../app";
import type { AuthedEnv } from "../require-user";
import {
  activeShiftFor,
  endMyShift,
  listShiftBoard,
  revokeShiftGrant,
} from "../shifts";
import { uuidParamSchema } from "./params";

/**
 * «Зміна» over the wire (#98/#99, ADR 0013). A Shift is *started* by scanning a
 * Café's wall poster — that route lives with the roster (`POST /api/poster-scans`).
 * These are the lifecycle's other ends: the owner's board (who is on shift, end
 * one early), and the barista's own «Завершити зміну» + "am I on shift?". Owner
 * routes require ownership, enforced by the ownership-scoped queries in
 * `../shifts` — same semantics as the loyalty config routes.
 */
export function registerShiftRoutes(
  app: Hono<AuthedEnv>,
  { db, clock }: AppDeps,
): void {
  // The owner's shift board: who is behind the counter right now.
  app.get("/api/cafes/:id/shifts", async (c) => {
    const user = c.get("user");

    const cafeId = uuidParamSchema.safeParse(c.req.param("id"));
    if (!cafeId.success) return c.json({ error: "not_found" }, 404);

    const board = await listShiftBoard(db, cafeId.data, user.id, clock.now());
    if (!board) return c.json({ error: "not_found" }, 404);

    const responseBody: ShiftsResponse = {
      active: board.active.map((shift) => ({
        id: shift.id,
        baristaName: shift.baristaName,
        startedAt: shift.startedAt.toISOString(),
        expiresAt: shift.expiresAt.toISOString(),
        scanCount: shift.scanCount,
      })),
      completedToday: board.completedToday.map((shift) => ({
        baristaName: shift.baristaName,
        startedAt: shift.startedAt.toISOString(),
        endedAt: shift.endedAt.toISOString(),
        scanCount: shift.scanCount,
      })),
    };
    return c.json(responseBody);
  });

  // The owner ends one shift early: the grant dies now instead of at its cap.
  app.delete("/api/cafes/:id/shifts/:grantId", async (c) => {
    const user = c.get("user");

    const cafeId = uuidParamSchema.safeParse(c.req.param("id"));
    const grantId = uuidParamSchema.safeParse(c.req.param("grantId"));
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

    await endMyShift(db, user.id, clock.now());
    return c.body(null, 204);
  });

  // The barista's side: "am I on shift?" — scanner mode's scope + banner expiry.
  app.get("/api/me/shift", async (c) => {
    const user = c.get("user");

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
