import type { Hono } from "hono";
import type { MemberCodeResponse } from "@kavtsya/shared";
import type { AppDeps } from "../app";
import { getOrCreateMemberCode } from "../member-code";
import type { AuthedEnv } from "../require-user";

/**
 * The Customer's stable member code (#21, ADR 0006): the offline fallback the
 * CafeOwner types when the rotating QR can't be scanned. Read-once contract —
 * the app fetches it a single time and caches it for offline display.
 */
export function registerMemberCodeRoutes(
  app: Hono<AuthedEnv>,
  { db }: AppDeps,
): void {
  app.get("/api/me/member-code", async (c) => {
    const user = c.get("user");

    // Not the guard's 401 (#51): the caller *is* authenticated — this is the
    // account row vanishing between the session read and the mint, which the
    // client can only respond to the same way, by signing in again.
    const memberCode = await getOrCreateMemberCode(db, user.id);
    if (!memberCode) return c.json({ error: "unauthorized" }, 401);

    const body: MemberCodeResponse = { memberCode };
    return c.json(body);
  });
}
