import {
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from "@expo-google-fonts/cormorant-garamond";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";

/** The font faces to load with `useFonts` at startup. */
export const fontAssets = {
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
};

/**
 * React Native font-family names. DTCG `font.family` holds web font *stacks*;
 * RN needs the one exact loaded face name — and @expo-google-fonts exports each
 * face under a name equal to the string used here. Display = Cormorant Garamond
 * (the wordmark, headings, the Ворожка voice); body = Manrope (all UI text).
 */
export const fontFamily = {
  display: {
    semibold: "CormorantGaramond_600SemiBold",
    bold: "CormorantGaramond_700Bold",
  },
  body: {
    regular: "Manrope_400Regular",
    medium: "Manrope_500Medium",
    semibold: "Manrope_600SemiBold",
    bold: "Manrope_700Bold",
  },
} as const;
