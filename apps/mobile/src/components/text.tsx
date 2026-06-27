import { StyleSheet, Text, type TextProps } from "react-native";

import { colors } from "@/theme/colors";

/** Primary body line — a person's name, a Café name. */
export function Title({ style, ...rest }: TextProps) {
  return <Text style={[styles.title, style]} {...rest} />;
}

/** De-emphasised helper text. */
export function Muted({ style, ...rest }: TextProps) {
  return <Text style={[styles.muted, style]} {...rest} />;
}

/** An error message; selectable so the user can copy it. */
export function ErrorText({ style, ...rest }: TextProps) {
  return <Text selectable style={[styles.error, style]} {...rest} />;
}

/** The uppercase "Режим Кавовара" mode label. */
export function OwnerBadge({ style, ...rest }: TextProps) {
  return <Text style={[styles.ownerBadge, style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    color: colors.brand,
    textAlign: "center",
  },
  muted: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
  error: {
    fontSize: 14,
    color: colors.error,
    textAlign: "center",
  },
  ownerBadge: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.accent,
    textAlign: "center",
  },
});
