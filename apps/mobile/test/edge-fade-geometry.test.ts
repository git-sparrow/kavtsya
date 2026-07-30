import { expect, test } from "vitest";

import { edgeFadeGeometry } from "../src/components/edge-fade-geometry";

/**
 * The edge-to-edge scroll strips (#165). Both the top and the bottom strip are
 * the same ramp mirrored, and the Reduce Transparency fallback has to reproduce
 * today's opaque band *exactly* — easy to get subtly wrong, so it's pinned here
 * rather than left to a screenshot.
 */

test("the fade runs the full inset plus a 24pt ramp inside the viewport", () => {
  const g = edgeFadeGeometry("top", 59, false);
  expect(g.kind).toBe("fade");
  expect(g.height).toBe(59 + 24);
});

test("the top ramp is opaque at the screen edge and clear at its inner end", () => {
  const g = edgeFadeGeometry("top", 59, false);
  if (g.kind !== "fade") throw new Error("expected a fade");
  expect(g.stops).toEqual([
    { offset: "0%", stopOpacity: 0.88 },
    { offset: "100%", stopOpacity: 0 },
  ]);
});

test("the bottom ramp is the top one mirrored — clear inside, opaque at the edge", () => {
  const g = edgeFadeGeometry("bottom", 34, false);
  if (g.kind !== "fade") throw new Error("expected a fade");
  expect(g.stops).toEqual([
    { offset: "0%", stopOpacity: 0 },
    { offset: "100%", stopOpacity: 0.88 },
  ]);
  expect(g.height).toBe(34 + 24);
});

test("Reduce Transparency drops the ramp for a solid band of exactly the inset", () => {
  // Today's shipping SafeAreaView band, reproduced pixel-for-pixel.
  expect(edgeFadeGeometry("top", 59, true)).toEqual({
    kind: "solid",
    height: 59,
  });
  expect(edgeFadeGeometry("bottom", 34, true)).toEqual({
    kind: "solid",
    height: 34,
  });
});

test("a zero inset still leaves the ramp, so a device without a notch fades too", () => {
  expect(edgeFadeGeometry("top", 0, false).height).toBe(24);
  // …but nothing at all to cover once transparency is off.
  expect(edgeFadeGeometry("top", 0, true).height).toBe(0);
});
