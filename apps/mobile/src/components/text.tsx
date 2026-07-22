import { Text, type TextProps } from "react-native";

import { fontFamily, useTheme } from "@/theme";

/**
 * A display-serif heading — the Cormorant greeting at the top of a Mode. The
 * redesign reuses it at several sizes (screen title 24, waiting/success 26,
 * dialog 23, serif promise 22); `size` overrides the default 2xl (28).
 */
export function Heading({
  size,
  style,
  ...rest
}: TextProps & { size?: number }) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          fontSize: size ?? t.font.size["2xl"],
          fontFamily: fontFamily.display.semibold,
          color: t.c.foreground,
        },
        style,
      ]}
      {...rest}
    />
  );
}

/** A quiet, left-aligned uppercase section heading, e.g. «МОЇ КАВ'ЯРНІ». */
export function SectionLabel({ style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          fontSize: t.font.size.xs,
          fontFamily: fontFamily.body.bold,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: t.c["text-muted"],
        },
        style,
      ]}
      {...rest}
    />
  );
}

/** Primary body line — a person's name, a Café name. */
export function Title({ style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          fontSize: t.font.size.lg,
          fontFamily: fontFamily.body.semibold,
          color: t.c.foreground,
          textAlign: "center",
        },
        style,
      ]}
      {...rest}
    />
  );
}

/** De-emphasised helper text. */
export function Muted({ style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          fontSize: t.font.size.sm,
          fontFamily: fontFamily.body.regular,
          color: t.c["text-muted"],
          textAlign: "center",
        },
        style,
      ]}
      {...rest}
    />
  );
}

/** An error message; selectable so the user can copy it. */
export function ErrorText({ style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <Text
      selectable
      style={[
        {
          fontSize: t.font.size.sm,
          fontFamily: fontFamily.body.medium,
          color: t.c.danger,
          textAlign: "center",
        },
        style,
      ]}
      {...rest}
    />
  );
}

/** The uppercase "Режим Кавовара" mode label. */
export function OwnerBadge({ style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          fontSize: t.font.size.sm,
          fontFamily: fontFamily.body.bold,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: t.c["text-secondary"],
          textAlign: "center",
        },
        style,
      ]}
      {...rest}
    />
  );
}
