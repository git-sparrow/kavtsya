import { Pressable, Text, View } from "react-native";

import { fontFamily, useTheme } from "@/theme";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  /** Optional explicit testID for the segment; defaults to none. */
  testID?: string;
};

/**
 * A pill segmented control (shared-component catalog §14): a `surface` + `border`
 * `radius-full` track holding two–three segments; the selected one fills with
 * `primary` and 600 `primary-foreground` text, the rest read `text-secondary`.
 * 44pt tall.
 *
 * Proper radio-group semantics — the track is a `radiogroup`, each segment a
 * `radio` announcing its selected state — so a screen-reader user hears «7 днів,
 * radio button» / «30 днів, selected». Used for the analytics 7/30-day period.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Group label for assistive tech, e.g. «Період». */
  label: string;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignSelf: "stretch",
        padding: 4,
        borderRadius: t.radius.full,
        backgroundColor: t.c.surface,
        borderWidth: 1,
        borderColor: t.c.border,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={option.testID}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: t.radius.full,
              backgroundColor: selected ? t.c.primary : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: t.font.size.base,
                fontFamily: selected
                  ? fontFamily.body.semibold
                  : fontFamily.body.medium,
                color: selected
                  ? t.c["primary-foreground"]
                  : t.c["text-secondary"],
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
