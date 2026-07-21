import { expect, test } from "vitest";

import { tokens } from "../src/theme/theme.generated";
import { toShadowStyle } from "../src/theme/shadow";

/**
 * The shadow-token → React Native converter (redesign, catalog §2). Surface used
 * to hardcode these values (and drifted the card blur to 16 vs the token's 22);
 * consuming the token means the two can't diverge again.
 */

test("splits an 8-digit hex into an opaque colour and a 0–1 opacity", () => {
  // card = #50371e26 → colour #50371e, alpha 0x26/255 ≈ 0.149
  const s = toShadowStyle(tokens.shadow.card);
  expect(s.shadowColor).toBe("#50371e");
  expect(s.shadowOpacity).toBeCloseTo(0x26 / 255, 5);
});

test("carries the token's offset and blur through (blur = shadowRadius)", () => {
  const s = toShadowStyle(tokens.shadow.card);
  expect(s.shadowOffset).toEqual({ width: 0, height: 8 });
  expect(s.shadowRadius).toBe(22); // the token value, not the old hardcoded 16
});

test("the reward glow reads primary-400 @ 25% from its token", () => {
  const s = toShadowStyle(tokens.shadow.reward);
  expect(s.shadowColor).toBe("#e8b44a");
  expect(s.shadowOpacity).toBeCloseTo(0x40 / 255, 5);
});

test("derives a non-zero Android elevation from the vertical offset", () => {
  expect(toShadowStyle(tokens.shadow.card).elevation).toBe(4);
});
