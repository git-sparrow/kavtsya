import type { Hono } from "hono";
import { z } from "zod";
import type { PosterScanResult, RosterBoardResponse } from "@kavtsya/shared";
import { posterScanBodySchema } from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import { activePushTokensFor } from "../push-tokens";
import {
  approveBarista,
  listRoster,
  removeBarista,
  scanPoster,
} from "../roster";

/** Café ids are uuids; a malformed id is simply "not found" (and avoids a DB cast error). */
const cafeIdSchema = z.string().uuid();

/**
 * The operational push body when a barista requests the roster (#97). Ukrainian
 * copy — flagged for Mari. Deliberately terse: it is a nudge to open the Roster
 * board, not the request itself.
 */
function rosterRequestPushBody(cafeName: string): string {
  return `Новий запит бариста приєднатися до «${cafeName}»`;
}

/**
 * Barista Roster + poster-started Shifts over the wire (#97/#98/#99, ADR 0013).
 * The barista scans a Café's wall poster (`POST /api/poster-scans`): a rostered
 * account starts a Shift, a stranger raises a request the owner sees on the
 * Roster board (`/api/cafes/:id/roster`). Owner-side routes require ownership,
 * enforced by the ownership-scoped queries in `../roster`.
 */
export function registerRosterRoutes(
  app: Hono<AppEnv>,
  { db, clock, pushProvider }: AppDeps,
): void {
  // The barista's side: scan the poster (or type its code). A rostered account
  // starts a Shift; a stranger raises a pending request; a shift already running
  // elsewhere asks for an explicit switch (#99).
  app.post("/api/poster-scans", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const parsed = posterScanBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return c.json({ error: "invalid_poster_scan" }, 400);
    }

    const outcome = await scanPoster(db, clock, {
      posterCode: parsed.data.posterCode,
      userId: user.id,
      confirmSwitch: parsed.data.confirmSwitch,
    });

    if (outcome.status === "unknown_poster") {
      return c.json({ error: "unknown_poster" }, 404);
    }

    if (outcome.status === "shift_started") {
      const body: PosterScanResult = {
        status: "shift_started",
        shift: {
          cafeId: outcome.cafeId,
          cafeName: outcome.cafeName,
          expiresAt: outcome.expiresAt.toISOString(),
        },
      };
      return c.json(body, 201);
    }

    if (outcome.status === "switch_required") {
      const body: PosterScanResult = {
        status: "switch_required",
        cafeName: outcome.cafeName,
        currentCafeName: outcome.currentCafeName,
      };
      // 200, not an error: a well-formed scan with a valid outcome the client
      // resolves by re-sending with confirmSwitch. The union's `status` carries
      // the branch, so the app handles all outcomes from one parsed body.
      return c.json(body, 200);
    }

    // Pending: notify the owner on their devices — an OPERATIONAL push, sent
    // regardless of their #24 marketing consent. Best-effort: a transport
    // hiccup must not fail the barista's request, which has already landed.
    if (outcome.notify) {
      const tokens = await activePushTokensFor(db, outcome.ownerUserId);
      if (tokens.length > 0) {
        try {
          await pushProvider.send(
            tokens.map((token) => ({
              token,
              body: rosterRequestPushBody(outcome.cafeName),
            })),
          );
        } catch {
          // Swallowed on purpose — the request stands; the owner still sees the
          // Roster-board badge on next open.
        }
      }
    }

    const body: PosterScanResult = {
      status: "pending",
      cafeName: outcome.cafeName,
    };
    return c.json(body, 200);
  });

  // The owner's Roster board: the poster code to print, pending requests, roster.
  app.get("/api/cafes/:id/roster", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const cafeId = cafeIdSchema.safeParse(c.req.param("id"));
    if (!cafeId.success) return c.json({ error: "not_found" }, 404);

    const board = await listRoster(db, cafeId.data, user.id);
    if (!board) return c.json({ error: "not_found" }, 404);

    const body: RosterBoardResponse = {
      posterCode: board.posterCode,
      pending: board.pending.map((p) => ({
        userId: p.userId,
        name: p.name,
        requestedAt: p.requestedAt.toISOString(),
      })),
      rostered: board.rostered.map((r) => ({
        userId: r.userId,
        name: r.name,
        approvedAt: r.approvedAt.toISOString(),
      })),
    };
    return c.json(body);
  });

  // Approve a pending request → rostered.
  app.post("/api/cafes/:id/roster/:userId/approve", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const cafeId = cafeIdSchema.safeParse(c.req.param("id"));
    if (!cafeId.success) return c.json({ error: "not_found" }, 404);

    const approved = await approveBarista(db, clock, {
      cafeId: cafeId.data,
      userId: c.req.param("userId"),
      ownerUserId: user.id,
    });
    if (!approved) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  // Remove a barista (rostered or pending) → none, ending any active Shift at
  // this Café at once (#99).
  app.delete("/api/cafes/:id/roster/:userId", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const cafeId = cafeIdSchema.safeParse(c.req.param("id"));
    if (!cafeId.success) return c.json({ error: "not_found" }, 404);

    const removed = await removeBarista(
      db,
      {
        cafeId: cafeId.data,
        userId: c.req.param("userId"),
        ownerUserId: user.id,
      },
      clock.now(),
    );
    if (!removed) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });
}
