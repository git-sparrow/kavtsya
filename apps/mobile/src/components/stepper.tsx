import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/icon";
import { fontFamily, useTheme } from "@/theme";

/** One 44pt round stepper button: − as a `border-strong` outline, + solid `primary`. */
function StepButton({
  kind,
  label,
  onPress,
  testID,
}: {
  kind: "minus" | "plus";
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const isPlus = kind === "plus";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: t.radius.full,
          alignItems: "center",
          justifyContent: "center",
        },
        isPlus
          ? { backgroundColor: t.c.primary }
          : { borderWidth: 1.5, borderColor: t.c["border-strong"] },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon
        name={kind}
        size={22}
        color={isPlus ? t.c["primary-foreground"] : t.c.foreground}
        strokeWidth={2}
      />
    </Pressable>
  );
}

/**
 * A ± number stepper (shared-component catalog §19): the 3b Зернятко threshold.
 * The whole control is one `adjustable` element for assistive tech (swipe
 * up/down to step), and the −/+ buttons are individually reachable too. The
 * clamping rule lives in the caller (`clampThreshold`); this just reports steps.
 * Always paired with a live BeanRow preview captioned «Так це побачить клієнт».
 */
export function Stepper({
  value,
  label,
  onStep,
  testID,
}: {
  value: number;
  label: string;
  onStep: (delta: number) => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: String(value) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) =>
        onStep(e.nativeEvent.actionName === "increment" ? 1 : -1)
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        alignSelf: "stretch",
        paddingHorizontal: t.space[2],
      }}
    >
      <StepButton
        kind="minus"
        label="Менше"
        onPress={() => onStep(-1)}
        testID={testID ? `${testID}-minus` : undefined}
      />
      <Text
        style={{
          fontSize: 34,
          fontFamily: fontFamily.body.bold,
          color: t.c.foreground,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      <StepButton
        kind="plus"
        label="Більше"
        onPress={() => onStep(1)}
        testID={testID ? `${testID}-plus` : undefined}
      />
    </View>
  );
}
