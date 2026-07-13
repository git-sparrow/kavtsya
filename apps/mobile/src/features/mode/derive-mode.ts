import type { Role } from "@kavtsya/shared";

/**
 * Role Modes (#96, ADR 0015). The app presents exactly three surfaces and the
 * one shown on launch is *derived* from live account facts, never stored — so
 * the visible Mode can never desync from server truth (a revoked barista or
 * former owner can't reopen into a dead Mode).
 */
export type Mode = "customer" | "owner" | "scanner";

/**
 * The Mode the app opens into, in the fixed precedence active Shift → Scanner;
 * else a CafeOwner → CafeOwner; else Customer. The order doubles as the
 * role-precedence rule for an account holding more than one role: an owner is
 * owner-primary (their consumer role is the Settings excursion), and a Shift
 * outranks everything because a barista at the counter needs the scanner.
 */
export function deriveLandingMode(
  roles: readonly Role[],
  hasActiveShift: boolean,
): Mode {
  if (hasActiveShift) return "scanner";
  if (roles.includes("cafe_owner")) return "owner";
  return "customer";
}

/**
 * The Mode actually shown, folding in a non-persisted Settings excursion: an
 * owner may step into their own Customer Mode and back (ADR 0015). Two rules
 * keep it honest:
 *  - Scanner is a locked near-kiosk — while a Shift is active it wins over any
 *    override; the only way out is ending the Shift (there is no excursion out).
 *  - An override is honoured only if it still names a Mode the account can
 *    reach, so a stale override (e.g. "owner" after the last Café is gone)
 *    falls back to the derived landing instead of stranding the user.
 */
export function effectiveMode(
  roles: readonly Role[],
  hasActiveShift: boolean,
  override: Mode | null,
): Mode {
  if (hasActiveShift) return "scanner";
  if (override && canReach(roles, override)) return override;
  return deriveLandingMode(roles, hasActiveShift);
}

/**
 * Whether an account with these roles may open this Mode as an excursion.
 * Everyone has Customer Mode; CafeOwner Mode needs an owned Café; Scanner is
 * never an override target — only an active Shift grants it.
 */
function canReach(roles: readonly Role[], mode: Mode): boolean {
  if (mode === "customer") return true;
  if (mode === "owner") return roles.includes("cafe_owner");
  return false;
}
