import { expect, test } from "vitest";

import {
  deriveLandingMode,
  effectiveMode,
} from "../src/features/mode/derive-mode";

/**
 * The landing-Mode precedence is the heart of #96 (ADR 0015): the app must open
 * in the account's highest active role, with a Shift always winning, and never
 * strand anyone in a Mode they can't reach. Pure logic — pinned here so the
 * on-device surfaces (checked via Argent) rest on a proven derivation.
 */

const CUSTOMER = ["customer"] as const;
const OWNER = ["customer", "cafe_owner"] as const;

test("a plain Customer lands in Customer Mode", () => {
  expect(deriveLandingMode(CUSTOMER, false)).toBe("customer");
});

test("a CafeOwner is owner-primary: they land in CafeOwner Mode", () => {
  expect(deriveLandingMode(OWNER, false)).toBe("owner");
});

test("an active Shift outranks CafeOwner — the counter needs the scanner", () => {
  expect(deriveLandingMode(OWNER, true)).toBe("scanner");
});

test("an active Shift outranks Customer too", () => {
  expect(deriveLandingMode(CUSTOMER, true)).toBe("scanner");
});

// --- the non-persisted Settings excursion ---------------------------------------

test("an owner's excursion into their own Customer Mode is honoured", () => {
  expect(effectiveMode(OWNER, false, "customer")).toBe("customer");
});

test("with no override the effective Mode is just the landing", () => {
  expect(effectiveMode(OWNER, false, null)).toBe("owner");
  expect(effectiveMode(CUSTOMER, false, null)).toBe("customer");
});

test("Scanner is a locked kiosk: an active Shift ignores any override", () => {
  expect(effectiveMode(OWNER, true, "customer")).toBe("scanner");
  expect(effectiveMode(OWNER, true, "owner")).toBe("scanner");
});

test("a stale override that names an unreachable Mode falls back to the landing", () => {
  // A plain Customer whose "owner" override lingers (last Café gone) is not
  // stranded in a dead CafeOwner Mode — they fall back to Customer.
  expect(effectiveMode(CUSTOMER, false, "owner")).toBe("customer");
});
