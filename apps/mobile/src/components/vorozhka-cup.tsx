import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";

import { Circle, Ellipse, Path, Svg } from "@/components/svg";

// The cup illustration's palette (canvas `#cup`): fixed brand hexes for a single
// approved artwork — neutral-100/300/900 + primary-400 — not a themeable surface.
const GOLD = "#E8B44A";
const CUP_BODY = "#BE9F7A";
const CREMA = "#F4E9D8";
const ESPRESSO = "#3A2117";
const SHADOW_1 = "#1a1430";
const SHADOW_2 = "#2f2545";

/**
 * The Ворожка cup (canvas `#cup`) with grounds swirling on its surface. The
 * static illustration is drawn once; a light overlay of espresso specks orbits
 * on an ellipse — `scaleY` flattens the circular path into the cup-surface
 * perspective, and a 5s linear loop (the `vorozhka` motion token) turns it.
 * Under reduce-motion the swirl freezes (the reveal fades in instead).
 * Decorative throughout — hidden from assistive tech.
 */
export function VorozhkaCup({ size = 200 }: { size?: number }) {
  const orb = size * 0.6;
  const [spin] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 5000, // the `vorozhka` motion token
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 150 150">
        <Circle
          cx={75}
          cy={72}
          r={60}
          fill="none"
          stroke={GOLD}
          strokeWidth={1.2}
          opacity={0.4}
        />
        <Circle
          cx={75}
          cy={72}
          r={52}
          fill="none"
          stroke={GOLD}
          strokeWidth={1}
          opacity={0.25}
        />
        <Ellipse cx={75} cy={118} rx={52} ry={10} fill={SHADOW_1} />
        <Ellipse cx={75} cy={116} rx={46} ry={8} fill={SHADOW_2} />
        <Path d="M33 62 Q34 108 75 110 Q116 108 117 62 Z" fill={CUP_BODY} />
        <Path
          d="M117 70 q22 2 20 22 q-3 16 -22 14"
          fill="none"
          stroke={CUP_BODY}
          strokeWidth={7}
          strokeLinecap="round"
        />
        <Ellipse cx={75} cy={62} rx={42} ry={13} fill={CREMA} />
        <Ellipse
          cx={75}
          cy={62}
          rx={42}
          ry={13}
          fill={ESPRESSO}
          opacity={0.08}
        />
      </Svg>

      <Animated.View
        style={{
          position: "absolute",
          left: size * 0.5 - orb / 2,
          top: size * (62 / 150) - orb / 2,
          width: orb,
          height: orb,
          transform: [{ scaleY: 0.3 }, { rotate }],
        }}
      >
        <Svg width={orb} height={orb} viewBox="0 0 100 100">
          <Circle cx={50} cy={16} r={2.6} fill={ESPRESSO} opacity={0.85} />
          <Circle cx={82} cy={38} r={2.1} fill={ESPRESSO} opacity={0.7} />
          <Circle cx={78} cy={72} r={2.4} fill={ESPRESSO} opacity={0.65} />
          <Circle cx={40} cy={86} r={1.8} fill={ESPRESSO} opacity={0.6} />
          <Circle cx={16} cy={54} r={2.2} fill={ESPRESSO} opacity={0.7} />
          <Circle cx={26} cy={26} r={1.6} fill={ESPRESSO} opacity={0.55} />
          <Circle cx={60} cy={44} r={1.4} fill={ESPRESSO} opacity={0.5} />
          <Circle cx={44} cy={58} r={1.5} fill={ESPRESSO} opacity={0.45} />
        </Svg>
      </Animated.View>
    </View>
  );
}
