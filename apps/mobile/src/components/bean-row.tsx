import { View } from "react-native";

import { Ellipse, Path, Svg } from "@/components/svg";
import { useTheme } from "@/theme";

/** Beyond this many, dots overflow the row — the paired count text carries it. */
const MAX_BEANS = 12;

/** Bean widths per size; height keeps the canvas 20×26 aspect. */
const BEAN_WIDTH = { inline: 13, large: 20 } as const;
const ASPECT = 26 / 20;

type BeanSize = keyof typeof BEAN_WIDTH;

/** One coffee bean (canvas `#bn-f`/`#bn-e`): oval + a curved espresso crease. */
function Bean({ filled, width }: { filled: boolean; width: number }) {
  const t = useTheme();
  const height = width * ASPECT;
  if (filled) {
    return (
      <Svg width={width} height={height} viewBox="0 0 20 26">
        <Ellipse cx={10} cy={13} rx={8} ry={11} fill={t.c.primary} />
        <Path
          d="M10 4 C6.5 8.5 6.5 17.5 10 22"
          fill="none"
          stroke={t.c["primary-foreground"]}
          strokeOpacity={0.55}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={width} height={height} viewBox="0 0 20 26">
      <Ellipse
        cx={10}
        cy={13}
        rx={7.4}
        ry={10.4}
        fill="none"
        stroke={t.c["border-strong"]}
        strokeWidth={1.6}
        strokeDasharray="4 3"
      />
    </Svg>
  );
}

/**
 * Bean-dot progress (catalog §8): coffee-bean shapes — filled to the balance,
 * dashed-outline for the rest — NOT circles. Shared across home / redemption /
 * Ворожка (and, later, program preview and analytics). The row is decorative:
 * it is always paired with a count line («4 зернятка · ще 1 до Винагороди»)
 * that carries the value for assistive tech, so the beans stay hidden. Renders
 * nothing past `MAX_BEANS` — the count text stands alone there.
 */
export function BeanRow({
  balance,
  threshold,
  size = "inline",
}: {
  balance: number;
  threshold: number;
  size?: BeanSize;
}) {
  if (threshold > MAX_BEANS) return null;
  const width = BEAN_WIDTH[size];
  const filled = Math.min(balance, threshold);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: size === "large" ? 8 : 6,
      }}
    >
      {Array.from({ length: threshold }, (_, i) => (
        <Bean key={i} filled={i < filled} width={width} />
      ))}
    </View>
  );
}
