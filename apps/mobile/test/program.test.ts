import { expect, test } from "vitest";

import { clampThreshold } from "../src/features/loyalty/program";

test("steps up and down by the delta", () => {
  expect(clampThreshold(10, 1)).toBe(11);
  expect(clampThreshold(10, -1)).toBe(9);
  expect(clampThreshold(5, -3)).toBe(2);
});

test("never drops below 1 (the redemption floor)", () => {
  expect(clampThreshold(1, -1)).toBe(1);
  expect(clampThreshold(1, -5)).toBe(1);
  expect(clampThreshold(2, -10)).toBe(1);
});

test("recovers to a valid threshold from a non-integer/NaN value", () => {
  expect(clampThreshold(Number.NaN, 1)).toBe(2);
  expect(clampThreshold(Number.NaN, -1)).toBe(1);
  expect(clampThreshold(10.7, 1)).toBe(11);
});
