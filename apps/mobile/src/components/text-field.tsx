import { StyleSheet, TextInput, type TextInputProps } from "react-native";

import { colors, radius } from "@/theme/colors";

/** A text input carrying the shared field styling; forwards all TextInput props. */
export function TextField({ style, ...rest }: TextInputProps) {
  return <TextInput style={[styles.input, style]} {...rest} />;
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.brand,
  },
});
