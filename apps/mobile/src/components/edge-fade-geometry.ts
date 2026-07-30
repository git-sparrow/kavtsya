import { tokens } from "@/theme/theme.generated";

/** Which screen edge a fade strip is pinned to. */
export type Edge = "top" | "bottom";

/** An SVG gradient stop, in the shape `<Stop>` takes. */
export type EdgeFadeStop = { offset: string; stopOpacity: number };

export type EdgeFadeGeometry =
  | { kind: "solid"; height: number }
  | { kind: "fade"; height: number; stops: EdgeFadeStop[] };

/**
 * How far past the safe-area inset the ramp reaches into the viewport. It runs
 * `space[10]` — longer than the scroll's `space[6]` content gutter, so the tail
 * overlaps the first content by 16pt. That is deliberate: at the tail the ramp
 * is already under 5% opaque, and a longer, softer falloff is what reads as
 * depth rather than a painted band.
 */
const RAMP = tokens.space[10];

/**
 * Peak opacity at the screen edge. Not 1: the point of #165 is that content
 * stays faintly visible behind the status bar / home indicator. Not lower
 * either — the clock and battery glyphs have to stay legible over it.
 */
const PEAK = 0.88;

/**
 * Stops across the ramp. Five, not two: a straight linear ramp lands on zero
 * with its slope intact, which the eye catches as a faint line across the
 * screen. Easing the curve dissolves that edge.
 */
const STOPS = 5;

/** Smoothstep — flat at both ends, steepest in the middle. */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Peak → 0 across the ramp, eased, rounded so the values stay legible. */
function rampOpacities(): number[] {
  return Array.from({ length: STOPS }, (_, i) => {
    const opacity = PEAK * (1 - smoothstep(i / (STOPS - 1)));
    return Math.round(opacity * 1e4) / 1e4;
  });
}

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
  // The gradient always paints top → bottom, so the bottom strip is the same
  // curve with its opacities reversed — offsets stay ascending either way.
  const opacities = rampOpacities();
  if (edge === "bottom") opacities.reverse();
  return {
    kind: "fade",
    height: inset + RAMP,
    stops: opacities.map((stopOpacity, i) => ({
      offset: `${(i / (STOPS - 1)) * 100}%`,
      stopOpacity,
    })),
  };
}
