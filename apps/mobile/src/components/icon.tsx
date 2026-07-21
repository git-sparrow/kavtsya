import type { ComponentType, ReactNode } from "react";
import SvgBase, {
  Circle as CircleBase,
  Path as PathBase,
  type CircleProps,
  type PathProps,
  type SvgProps,
} from "react-native-svg";

import { useTheme } from "@/theme";

// react-native-svg declares its exports as classes; React 19's stricter JSX
// element typing rejects them (the same coercion customer-qr.tsx applies to
// react-native-qrcode-svg and scan-workstation.tsx applies to expo-camera).
const Svg = SvgBase as unknown as ComponentType<SvgProps>;
const Path = PathBase as unknown as ComponentType<PathProps>;
const Circle = CircleBase as unknown as ComponentType<CircleProps>;

/**
 * The line-icon set, straight from the design canvas: a 24-grid, 1.6px stroke,
 * round caps/joins, `currentColor` (no icon library, no emoji — catalog
 * cross-cutting rule). Presentation attributes set on the `<Svg>` root inherit
 * to the paths, so a single `color` recolours the whole glyph.
 */
const GLYPHS: Record<string, ReactNode> = {
  // Settings sliders (home header «Налаштування»).
  settings: (
    <>
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <Circle cx={16} cy={7} r={2.4} />
      <Circle cx={10} cy={17} r={2.4} />
    </>
  ),
  check: <Path d="M4.5 12.5l5 5 10-11" />,
  // Alert (danger strips): a ringed «!».
  alert: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7.5v5.5M12 16.4v.2" />
    </>
  ),
  // Info / excluded (informational strips): a ringed «i».
  info: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 8v5M12 16.5v.01" />
    </>
  ),
  close: <Path d="M6 6l12 12M18 6L6 18" />,
};

export type IconName = keyof typeof GLYPHS;

/**
 * A decorative-by-default line icon. Icons that carry meaning must be paired
 * with visible text (status = icon + text, never icon alone), so the glyph
 * itself stays hidden from assistive tech.
 */
export function Icon({
  name,
  size = 24,
  color,
  strokeWidth = 1.6,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const t = useTheme();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? t.c.foreground}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {GLYPHS[name]}
    </Svg>
  );
}
