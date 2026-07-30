import { useEffect, useId, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

import { edgeFadeGeometry, type Edge } from "./edge-fade-geometry";
import { Defs, LinearGradient, Rect, Stop, Svg } from "./svg";

/**
 * A decorative strip over one safe-area edge of a full-height scroll (#165).
 * Scroll content runs edge to edge underneath it and fades out as it passes
 * behind the status bar / home indicator, instead of being clipped dead against
 * an opaque band. Render one per edge as the LAST children of the container, so
 * they paint above the `ScrollView`:
 *
 *     <ScrollView …/>
 *     <EdgeFade edge="top" />
 *     <EdgeFade edge="bottom" />
 *
 * The scroll itself owns the matching `paddingTop`/`paddingBottom` — this only
 * paints. Purely decorative: it never reaches assistive technology, and the
 * fade never takes a touch (the opaque Reduce Transparency band does — see
 * below). The colour is `background` from the ambient theme, so it follows the
 * ВИГЛЯД choice and goes dark inside the Ворожка reveal for free.
 */
export function EdgeFade({ edge }: { edge: Edge }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduceTransparency = useReduceTransparency();
  const geometry = edgeFadeGeometry(edge, insets[edge], reduceTransparency);
  // Gradient ids are looked up by name, and two strips (or a Screen under an
  // open reveal) coexist — give each its own. `useId` embeds characters that
  // are not valid in a `url(#…)` reference, hence the strip.
  const gradientId = `edge-fade-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const frame = {
    position: "absolute",
    left: 0,
    right: 0,
    height: geometry.height,
    ...(edge === "top" ? { top: 0 } : { bottom: 0 }),
  } as const;

  if (geometry.kind === "solid") {
    return (
      <View
        // Deliberately NOT `pointerEvents="none"`, unlike the fade: this band is
        // opaque, so anything scrolled under it is invisible, and letting taps
        // through would leave a control firing from what looks like bare chrome.
        // Swallowing them restores the old `SafeAreaView` band exactly — that
        // strip was outside the scroll viewport and inert.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[frame, { backgroundColor: t.c.background }]}
      />
    );
  }

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={frame}
    >
      <Svg width="100%" height="100%">
        <Defs>
          {/* Vertical: react-native-svg's default gradient runs left→right. */}
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            {geometry.stops.map((stop) => (
              <Stop
                key={stop.offset}
                offset={stop.offset}
                // One colour at both stops — opacity does all the work, so
                // there is no hex-alpha maths and it themes for free.
                stopColor={t.c.background}
                stopOpacity={stop.stopOpacity}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={`url(#${gradientId})`}
        />
      </Svg>
    </View>
  );
}

/**
 * iOS Reduce Transparency, live. Someone who has asked the OS to stop content
 * showing through chrome is exactly this feature's edge case, so they get the
 * solid band instead. Android has no equivalent flag and always reads `false`.
 */
function useReduceTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {
        // No accessibility manager (some simulators): keep the fade.
      });
    const sub = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduced,
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
