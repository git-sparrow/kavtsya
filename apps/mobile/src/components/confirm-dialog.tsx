import { useCallback, useRef } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { Icon, type IconName } from "@/components/icon";
import { Heading } from "@/components/text";
import { fontFamily, useTheme } from "@/theme";

/**
 * How hard the dialog pushes back (catalog §10):
 * - `neutral` — reversible action: confirm is `primary`, focus starts on it (6c, 6d, 8c).
 * - `danger` — irreversible: confirm is solid `danger` and focus starts on the
 *   SAFE action, so a screen-reader user never lands on the destructive button (6b, 7d).
 */
export type ConfirmTone = "neutral" | "danger";

/** The context chip above the title: a glyph on a tinted circle, or a person. */
export type ConfirmChip =
  | { glyph: IconName; tone?: "primary" | "danger" }
  | { avatar: string };

/**
 * The app's confirm dialog (catalog §10, redesign turn 6) — the replacement for
 * OS alerts, so a destructive question is asked in the brand's own type and «ти»
 * voice: scrim, `radius-xl` card, a context chip that names *what* is affected,
 * a serif title, the consequences in `text-secondary`, then full-width 48pt
 * buttons stacked with the confirm on top.
 *
 * Rules the anatomy enforces, not the caller:
 * - Buttons carry verbs, never «Так/Ні» — `confirmLabel`/`cancelLabel` are required.
 * - Focus placement follows `tone` (safe action first on a danger dialog), and the
 *   card traps assistive focus while it is open (`accessibilityViewIsModal`).
 * - The scrim and the OS back gesture cancel — except when `dismissible` is off
 *   (the delete-account class of dialog, where only an explicit button decides).
 *
 * `busy` keeps the dialog open with the confirm button spinning, so the caller
 * can await the server before it closes (and a second tap can't double-submit).
 */
export function ConfirmDialog({
  visible,
  tone = "neutral",
  chip,
  title,
  body,
  confirmLabel,
  cancelLabel,
  dismissible = true,
  busy = false,
  onConfirm,
  onCancel,
  testID,
}: {
  visible: boolean;
  tone?: ConfirmTone;
  chip?: ConfirmChip;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  dismissible?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const confirmRef = useRef<View>(null);
  const cancelRef = useRef<View>(null);

  // Initial focus: the safe action on a danger dialog, the confirm otherwise.
  // Done on `onShow` — before the modal is mounted there is no node to focus.
  const focusInitial = useCallback(() => {
    const target = tone === "danger" ? cancelRef.current : confirmRef.current;
    const node = target && findNodeHandle(target);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [tone]);

  const dismiss = dismissible ? onCancel : () => {};

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={focusInitial}
      onRequestClose={dismiss}
    >
      <Pressable
        testID={testID ? `${testID}.scrim` : undefined}
        // Tapping the scrim cancels — except on a non-dismissible dialog, where
        // it is inert (and so must not advertise itself as a button).
        accessibilityRole={dismissible ? "button" : undefined}
        accessibilityLabel={dismissible ? cancelLabel : undefined}
        onPress={dismiss}
        style={{
          flex: 1,
          backgroundColor: t.c.scrim,
          justifyContent: "center",
          padding: t.space[6],
        }}
      >
        {/* Swallow taps inside the card so they don't reach the scrim. The card
            itself is not an accessibility element — as one it would swallow the
            chip, text, and buttons into a single aggregated announcement. */}
        <Pressable
          testID={testID}
          accessible={false}
          accessibilityViewIsModal
          onPress={() => {}}
          style={{
            backgroundColor: t.c.surface,
            borderRadius: t.radius.xl,
            borderWidth: 1,
            borderColor: t.c.border,
            padding: t.space[5],
            gap: t.space[4],
          }}
        >
          {chip ? <ContextChip chip={chip} tone={tone} /> : null}

          {/* Title + consequences read as one announcement; the buttons stay
              separately reachable because the group wraps only the text. */}
          <View
            accessible
            accessibilityLiveRegion="assertive"
            accessibilityLabel={`${title}. ${body}`}
            style={{ gap: t.space[2] }}
          >
            <Heading size={23} accessibilityRole="header">
              {title}
            </Heading>
            <Text
              style={{
                fontSize: t.font.size.base,
                lineHeight: t.font.size.base * t.font.lineHeight.snug,
                fontFamily: fontFamily.body.regular,
                color: t.c["text-secondary"],
              }}
            >
              {body}
            </Text>
          </View>

          {/* Confirm on top, the safe action below it — `secondary` carries its
              own `space-2` top margin, which completes the gap. */}
          <View style={{ gap: t.space[1] }}>
            <Button
              ref={confirmRef}
              title={confirmLabel}
              variant={tone === "danger" ? "danger" : "primary"}
              busy={busy}
              testID={testID ? `${testID}.confirm` : undefined}
              onPress={onConfirm}
            />
            <Button
              ref={cancelRef}
              title={cancelLabel}
              variant="secondary"
              disabled={busy}
              testID={testID ? `${testID}.cancel` : undefined}
              onPress={onCancel}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * The context chip: whichever thing the dialog is about, shown before the
 * question — a person (avatar + name) for staff actions (6c/6d), or a glyph on a
 * tinted circle for account-level ones (the danger warning of 6b, the storefront
 * of 7a). Decorative on its own; the title and body carry the meaning.
 */
function ContextChip({ chip, tone }: { chip: ConfirmChip; tone: ConfirmTone }) {
  const t = useTheme();

  if ("avatar" in chip) {
    return (
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: t.space[3] }}
      >
        <Avatar name={chip.avatar} size={34} />
        <Text
          style={{
            fontSize: t.font.size.base,
            fontFamily: fontFamily.body.bold,
            color: t.c.foreground,
          }}
        >
          {chip.avatar}
        </Text>
      </View>
    );
  }

  const danger = (chip.tone ?? tone) === "danger";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 54,
        height: 54,
        borderRadius: t.radius.full,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: danger
          ? t.c["danger-surface"]
          : t.c["primary-surface"],
        // `primary-surface` collapses onto `surface` in dark (standing rule) —
        // ring the circle so it doesn't vanish.
        borderWidth: t.themeName === "dark" ? 1 : 0,
        borderColor: danger ? t.c.danger : t.c.primary,
      }}
    >
      <Icon
        name={chip.glyph}
        size={26}
        color={danger ? t.c.danger : t.c.primary}
        strokeWidth={1.8}
      />
    </View>
  );
}
