import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

/**
 * A bottom sheet (catalog §22): `surface` with `radius-xl` top corners, a drag
 * handle, over the `scrim` token. Tapping the scrim (or the OS back gesture)
 * dismisses; taps inside the card don't. Kept as a single primitive for now
 * (only 1g uses it) — promote patterns into it only when a second sheet appears.
 * Contents inherit the active theme, so the sheet is light or dark with the
 * screen behind it.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрити"
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: t.c.scrim,
          justifyContent: "flex-end",
        }}
      >
        {/* Swallow taps inside the card so they don't reach the scrim. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: t.c.surface,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            paddingHorizontal: t.space[5],
            paddingTop: t.space[3],
            paddingBottom: insets.bottom + t.space[5],
            gap: t.space[3],
            alignItems: "center",
          }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 40,
              height: 5,
              borderRadius: 999,
              backgroundColor: t.c["border-strong"],
              marginBottom: t.space[2],
            }}
          />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
