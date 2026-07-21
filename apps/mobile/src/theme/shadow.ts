import type { ViewStyle } from "react-native";

import { tokens } from "./theme.generated";

/** The DTCG shadow token shape as emitted into `theme.generated.ts`. */
export type ShadowToken = (typeof tokens.shadow)[keyof typeof tokens.shadow];

const px = (value: string): number => parseFloat(value);

/**
 * A design shadow token → React Native style. The tokens are authored web-style
 * (`{ color: "#RRGGBBAA", offsetY: "8px", blur: "22px" }`); RN wants the iOS
 * `shadow*` props with an opaque colour and a separate opacity, plus an Android
 * `elevation`. Consume this instead of hand-copying values — the old Surface
 * hardcoded the card shadow and even drifted its blur (16) from the token (22).
 */
export function toShadowStyle(token: ShadowToken): ViewStyle {
  // 8-digit hex (#RRGGBBAA) → opaque colour + 0–1 opacity: RN's `shadowColor`
  // is unreliable with an embedded alpha on iOS, so split them.
  const hex = token.color;
  const hasAlpha = hex.length === 9;
  const shadowColor = hasAlpha ? hex.slice(0, 7) : hex;
  const shadowOpacity = hasAlpha ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  const offsetY = px(token.offsetY);
  return {
    shadowColor,
    shadowOffset: { width: px(token.offsetX), height: offsetY },
    shadowOpacity,
    shadowRadius: px(token.blur),
    // Android has no blur/opacity knobs — approximate depth from the vertical
    // offset (card 8 → 4 reproduces the prior hand-tuned elevation).
    elevation: Math.max(1, Math.round(offsetY / 2)),
  };
}
