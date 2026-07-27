import type { ReactNode } from "react";

import { Circle, Path, Svg } from "@/components/svg";
import { useTheme } from "@/theme";

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
  // Navigation chevrons: row disclosure (right) and header back (left).
  "chevron-right": <Path d="M9 5l7 7-7 7" />,
  "chevron-left": <Path d="M15 5l-7 7 7 7" />,
  // Плюс / мінус for the threshold stepper.
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  // Viewfinder brackets — the «Сканувати QR клієнта» hero glyph.
  scan: (
    <Path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
  ),
  // Зміни — a clock.
  clock: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7.5V12l3.5 2" />
    </>
  ),
  // Ростер бариста / stat card — a pair of people.
  people: (
    <>
      <Circle cx={9} cy={8} r={3.2} />
      <Path d="M3.5 19.5a5.5 5.5 0 0111 0" />
      <Path d="M16 5.6a3.2 3.2 0 010 6M17.5 14.4a5.5 5.5 0 013 5.1" />
    </>
  ),
  // Розсилка — a megaphone.
  megaphone: (
    <>
      <Path d="M4 10v4a1 1 0 001 1h2l2.5 4V6L7 9H5a1 1 0 00-1 1z" />
      <Path d="M13 8.5a4.5 4.5 0 010 7" />
    </>
  ),
  // Аналітика — a bar chart.
  chart: <Path d="M5 20V11M12 20V4M19 20v-6M3.5 20h17" />,
  // Стати Кавоваром / café row — a storefront with an awning.
  storefront: (
    <>
      <Path d="M4 10.5V19a1 1 0 001 1h14a1 1 0 001-1v-8.5" />
      <Path d="M3.5 10.5l1.4-4.2A2 2 0 016.8 5h10.4a2 2 0 011.9 1.3l1.4 4.2a2.2 2.2 0 01-4.25.8 2.2 2.2 0 01-4.2 0 2.2 2.2 0 01-4.2 0 2.2 2.2 0 01-4.25-.8z" />
      <Path d="M10 20v-4.5h4V20" />
    </>
  ),
  // Мій профіль клієнта — a single person (head + shoulders).
  user: (
    <>
      <Circle cx={12} cy={8} r={3.4} />
      <Path d="M5.5 20a6.5 6.5 0 0113 0" />
    </>
  ),
  // Вийти — a door with an arrow leaving it («←]» on the canvas).
  logout: (
    <>
      <Path d="M14 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4" />
      <Path d="M10 8l-4 4 4 4M6 12h9" />
    </>
  ),
  // Alert (danger strips): a ringed «!».
  alert: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7.5v5.5M12 16.4v.2" />
    </>
  ),
  // Warning (the irreversible-action chip of 6b/7d): a triangle around «!». The
  // ringed `alert` above is the inline-strip glyph; the triangle is reserved for
  // the dialogs that destroy something, so the shape itself reads as heavier.
  warning: (
    <>
      <Path d="M12 3.8L21.2 19a1.4 1.4 0 01-1.2 2H4a1.4 1.4 0 01-1.2-2z" />
      <Path d="M12 9.5v4.2M12 17.1v.2" />
    </>
  ),
  // Видалити акаунт — a bin with a lid.
  trash: (
    <>
      <Path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0110.7 4h2.6a1.2 1.2 0 011.2 1.2V7" />
      <Path d="M6.5 7l.9 12a1.5 1.5 0 001.5 1.4h6.2a1.5 1.5 0 001.5-1.4l.9-12" />
      <Path d="M10.5 11v6M13.5 11v6" />
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
