import { z } from "zod";

/**
 * Contract for the `/health` endpoint, shared by the API (which produces it)
 * and the mobile app (which validates it). This is the first link in the
 * client -> API -> DB chain the walking skeleton proves out.
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  db: z.literal("ok"),
  time: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * Roles an account can hold (ADR 0003). Every account is a `customer`;
 * `cafe_owner` is unlocked by registering a Café and is derived from ownership,
 * not stored as a flag.
 */
export const roleSchema = z.enum(["customer", "cafe_owner"]);
export type Role = z.infer<typeof roleSchema>;

/**
 * Body for registering a Café (`POST /api/cafes`) — the CafeOwner signup step
 * that unlocks the `cafe_owner` role. Trimmed so leading/trailing whitespace
 * can't smuggle in an "empty" name.
 */
export const createCafeBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type CreateCafeBody = z.infer<typeof createCafeBodySchema>;

/** A registered Café as the API returns it. */
export const cafeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type Cafe = z.infer<typeof cafeSchema>;

/**
 * Contract for `GET /api/me`: the account, its derived roles, and the Cafés it
 * owns. The mobile app reads `roles` to decide whether to offer CafeOwner Mode.
 */
export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  roles: z.array(roleSchema),
  cafes: z.array(cafeSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
