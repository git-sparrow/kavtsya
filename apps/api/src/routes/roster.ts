import type { Hono } from "hono";
import { z } from "zod";
import type { RosterBoardResponse, RosterRequestResult } from "@kavtsya/shared";
import { rosterRequestBodySchema } from "@kavtsya/shared";
import type { AppDeps, AppEnv } from "../app";
import { activePushTokensFor } from "../push-tokens";
import {
  approveBarista,
  listRoster,
  raiseRosterRequest,
  removeBarista,
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
 * Barista Roster over the wire (#97, ADR 0013): the barista scans a Café's wall
 * poster to raise a request (`POST /api/roster-requests`); the owner sees and
 * acts on it from the Roster board (`/api/cafes/:id/roster`). Owner-side routes
 * require ownership of the Café, enforced by the ownership-scoped queries in
 * `../roster` — same semantics as the shift board.
 */
export function registerRosterRoutes(
  app: Hono<AppEnv>,
  { db, clock, pushProvider }: AppDeps,
): void {
  // The barista's side: scan the poster (or type its code) to request the roster.
  app.post("/api/roster-requests", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const parsed = rosterRequestBodySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return c.json({ error: "invalid_roster_request" }, 400);
    }

    const outcome = await raiseRosterRequest(db, clock, {
      posterCode: parsed.data.posterCode,
      userId: user.id,
    });
    if (outcome.status === "unknown_poster") {
      return c.json({ error: "unknown_poster" }, 404);
    }

    // Notify the owner on their devices — an OPERATIONAL push, sent regardless
    // of their #24 marketing consent. Best-effort: a transport hiccup must not
    // fail the barista's request, which has already landed.
    if (outcome.status === "pending" && outcome.notify) {
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

    const body: RosterRequestResult = {
      status: outcome.status === "rostered" ? "rostered" : "pending",
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

  // Remove a barista (rostered or pending) → none.
  app.delete("/api/cafes/:id/roster/:userId", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const cafeId = cafeIdSchema.safeParse(c.req.param("id"));
    if (!cafeId.success) return c.json({ error: "not_found" }, 404);

    const removed = await removeBarista(db, {
      cafeId: cafeId.data,
      userId: c.req.param("userId"),
      ownerUserId: user.id,
    });
    if (!removed) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });
}
