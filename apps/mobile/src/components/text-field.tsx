import { TextInput, type TextInputProps } from "react-native";

import { fontFamily, useTheme } from "@/theme";

/** A text input carrying the shared field styling; forwards all TextInput props. */
export function TextField({ style, ...rest }: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.c["text-muted"]}
      style={[
        {
          borderWidth: 1,
          borderColor: t.c.border,
          borderRadius: t.radius.md,
          paddingHorizontal: t.space[3],
          paddingVertical: t.space[3],
          fontSize: t.font.size.base,
          fontFamily: fontFamily.body.regular,
          backgroundColor: t.c.surface,
          color: t.c.foreground,
        },
        style,
      ]}
      {...rest}
    />
  );
}
