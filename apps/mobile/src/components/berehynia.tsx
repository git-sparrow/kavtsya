import type { ComponentType } from "react";
import SvgBase, {
  Circle as CircleBase,
  Path as PathBase,
  type CircleProps,
  type PathProps,
  type SvgProps,
} from "react-native-svg";

import { useTheme } from "@/theme";

// React 19 strict-JSX coercion for react-native-svg's class exports (see icon.tsx).
const Svg = SvgBase as unknown as ComponentType<SvgProps>;
const Path = PathBase as unknown as ComponentType<PathProps>;
const Circle = CircleBase as unknown as ComponentType<CircleProps>;

/**
 * The Берегиня ornament (canvas `#bere`): the brand's protective mark — nested
 * diamonds, a centre dot, and four rays. It stands in for emoji throughout the
 * app (cross-cutting rule) and is always small, `primary`, and decorative, so it
 * is hidden from assistive tech. Defaults to `primary`; pass `color` to override
 * (e.g. `link` on light identity chips).
 */
export function Berehynia({
  size = 16,
  color,
}: {
  size?: number;
  color?: string;
}) {
  const t = useTheme();
  const stroke = color ?? t.c.primary;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke={stroke}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d="M24 6 L38 24 L24 42 L10 24 Z" />
      <Path d="M24 15 L31 24 L24 33 L17 24 Z" strokeWidth={2} />
      <Circle cx={24} cy={24} r={2.4} fill={stroke} stroke="none" />
      <Path d="M10 24 L4 19 M10 24 L4 29" />
      <Path d="M38 24 L44 19 M38 24 L44 29" />
      <Path d="M24 6 L20 1 M24 6 L28 1" />
      <Path d="M24 42 L20 47 M24 42 L28 47" />
    </Svg>
  );
}
