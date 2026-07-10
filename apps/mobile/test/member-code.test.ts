import { expect, test } from "vitest";

import {
  formatMemberCode,
  isWellFormedMemberCode,
  normalizeMemberCode,
} from "@kavtsya/shared";

/**
 * The member code as the two screens handle it (#21): the Customer's QR screen
 * displays it grouped (`XXXX-XXXX`), and the CafeOwner's manual entry
 * normalizes what was typed before deciding whether it is worth submitting.
 */

test("a stored code displays grouped as XXXX-XXXX", () => {
  expect(formatMemberCode("K7Q4M2ZX")).toBe("K7Q4-M2ZX");
});

test("typing folds case and separators back to the stored form", () => {
  expect(normalizeMemberCode(" k7q4-m2zx ")).toBe("K7Q4M2ZX");
  expect(normalizeMemberCode("K7Q4 M2ZX")).toBe("K7Q4M2ZX");
});

test("Crockford confusables map to their canonical characters (o→0, i/l→1)", () => {
  // A barista reading a cracked screen types O for 0 and l/i for 1.
  expect(normalizeMemberCode("oO00-iIlL")).toBe("00001111");
});

test("well-formedness gates submission: 8 alphabet chars after normalization", () => {
  expect(isWellFormedMemberCode(normalizeMemberCode("k7q4-m2zx"))).toBe(true);
  // Too short, and containing a letter outside the Crockford alphabet (U).
  expect(isWellFormedMemberCode(normalizeMemberCode("k7q4"))).toBe(false);
  expect(isWellFormedMemberCode(normalizeMemberCode("K7Q4M2ZU"))).toBe(false);
});
