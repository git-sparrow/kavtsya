import { tokens } from "@/theme/theme.generated";

/** Which screen edge a fade strip is pinned to. */
export type Edge = "top" | "bottom";

/** An SVG gradient stop, in the shape `<Stop>` takes. */
export type EdgeFadeStop = { offset: string; stopOpacity: number };

export type EdgeFadeGeometry =
  | { kind: "solid"; height: number }
  | { kind: "fade"; height: number; stops: [EdgeFadeStop, EdgeFadeStop] };

/**
 * How far past the safe-area inset the ramp reaches into the viewport. It is
 * the same token as the scroll's content gutter (`Screen`'s `paddingTop` /
 * `paddingBottom` are `inset + space[6]`) on purpose: the ramp then ends
 * exactly where content is allowed to start, so nothing is ever fully faded.
 */
const RAMP = tokens.space[6];

/**
 * Peak opacity at the screen edge. Not 1: the point of #165 is that content
 * stays faintly visible behind the status bar / home indicator. Not lower
 * either — the clock and battery glyphs have to stay legible over it.
 */
const PEAK = 0.88;

/**
 * The size and gradient of one edge strip (#165), kept apart from the component
 * so the mirroring and the Reduce Transparency fallback are testable without a
 * renderer.
 *
 * `reduceTransparency` (iOS only) returns a solid band of exactly the inset —
 * i.e. the opaque `SafeAreaView` edge this feature replaces, unchanged for the
 * users who asked the OS to stop content showing through chrome.
 */
export function edgeFadeGeometry(
  edge: Edge,
  inset: number,
  reduceTransparency: boolean,
): EdgeFadeGeometry {
  if (reduceTransparency) return { kind: "solid", height: inset };
  const edgeStop = { offset: "0%", stopOpacity: PEAK };
  const innerStop = { offset: "100%", stopOpacity: 0 };
  return {
    kind: "fade",
    height: inset + RAMP,
    // The gradient always runs top→bottom, so at the bottom edge the opaque end
    // is the *second* stop.
    stops:
      edge === "top"
        ? [edgeStop, innerStop]
        : [
            { ...innerStop, offset: "0%" },
            { ...edgeStop, offset: "100%" },
          ],
  };
}
