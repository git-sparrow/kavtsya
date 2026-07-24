import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated } from "react-native";

import { useTheme } from "@/theme";

const TRACK_W = 52;
const TRACK_H = 32;
const KNOB = 26;
const PAD = (TRACK_H - KNOB) / 2;

/**
 * The settings switch knob + track (shared-component catalog §17): on = `primary`
 * track + white knob; off = a `border-strong` outline track + a muted knob.
 *
 * Purely presentational and hidden from assistive tech — the enclosing toggle
 * row is the actual `switch` (a single node with the label + caption + on/off
 * state), so the whole 52pt row is the target and a screen-reader hears one
 * control, not a switch nested in a button. The knob slides between states,
 * static under reduce-motion.
 */
export function Toggle({ value }: { value: boolean }) {
  const t = useTheme();
  // Render-stable Animated.Value via lazy state init (the repo pattern) — a
  // useRef `.current` read here trips the react-hooks/refs lint.
  const [pos] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    let animate = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!animate) return;
      if (reduced) {
        pos.setValue(value ? 1 : 0);
      } else {
        Animated.timing(pos, {
          toValue: value ? 1 : 0,
          duration: 140,
          useNativeDriver: true,
        }).start();
      }
    });
    return () => {
      animate = false;
    };
  }, [value, pos]);

  const translateX = pos.interpolate({
    inputRange: [0, 1],
    outputRange: [PAD, TRACK_W - KNOB - PAD],
  });

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: t.radius.full,
        justifyContent: "center",
        backgroundColor: value ? t.c.primary : "transparent",
        borderWidth: value ? 0 : 2,
        borderColor: t.c["border-strong"],
      }}
    >
      <Animated.View
        style={{
          width: KNOB,
          height: KNOB,
          borderRadius: t.radius.full,
          backgroundColor: value ? t.color.base.white : t.c["border-strong"],
          transform: [{ translateX }],
        }}
      />
    </Animated.View>
  );
}
