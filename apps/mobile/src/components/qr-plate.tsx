import { formatMemberCode } from "@kavtsya/shared";
import { type ComponentType, useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Text, View } from "react-native";
import QRCodeBase, { type QRCodeProps } from "react-native-qrcode-svg";

import { fontFamily, useTheme } from "@/theme";

// React 19 strict-JSX coercion for the qrcode-svg class export (see customer-qr.tsx).
const QRCode = QRCodeBase as unknown as ComponentType<QRCodeProps>;

/** Side of the rendered QR square, in dp. */
const QR_SIZE = 196;
/** Plate padding around the QR square. */
const PLATE_PAD = 16;

/**
 * The live-token cue ring (ADR 0006 anti-screenshot): a slow-spinning `primary`
 * ring that signals the code is alive and rotating. Decorative — hidden from
 * assistive tech — and freezes to a full static ring under reduce-motion.
 */
function LiveRing() {
  const t = useTheme();
  // Lazy state, not a ref: the lint rule forbids reading a ref's value
  // (`spin.interpolate`) during render, and Animated.Value is render-stable.
  const [spin] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: 13,
          height: 13,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: t.c.primary,
          borderTopColor: reduceMotion ? t.c.primary : "transparent",
        },
        !reduceMotion && { transform: [{ rotate }] },
      ]}
    />
  );
}

/**
 * The Customer's QR on its white plate (catalog §21). The plate is always the
 * `qr-plate` token (white in BOTH themes) with espresso modules, so any scanner
 * reads it; there is no centre logo (rejected decision). A null `token` is the
 * loading state — the square is reserved (on `primary-surface`) so the layout
 * never jumps — otherwise the live-token cue sits beneath the code. The member
 * code is the always-on offline fallback (#21): shown in both states.
 */
export function QRPlate({
  token,
  memberCode,
}: {
  token: string | null;
  memberCode: string | null;
}) {
  const t = useTheme();
  const hasToken = token !== null;

  return (
    <View style={{ alignItems: "center", gap: t.space[3] }}>
      <View
        style={{
          width: QR_SIZE + PLATE_PAD * 2,
          height: QR_SIZE + PLATE_PAD * 2,
          borderRadius: t.radius.lg,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: hasToken ? t.c["qr-plate"] : t.c["primary-surface"],
        }}
      >
        {hasToken ? (
          <QRCode
            value={token}
            size={QR_SIZE}
            color={t.color.neutral[950]}
            backgroundColor={t.c["qr-plate"]}
          />
        ) : (
          <LiveRing />
        )}
      </View>

      {hasToken ? (
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
          accessibilityLabel="Код живий — оновлюється сам"
        >
          <LiveRing />
          <Text
            style={{
              fontSize: 12,
              fontFamily: fontFamily.body.regular,
              color: t.c["text-muted"],
            }}
          >
            Код живий — оновлюється сам
          </Text>
        </View>
      ) : (
        <Text
          style={{
            fontSize: 13,
            fontFamily: fontFamily.body.regular,
            color: t.c["text-muted"],
          }}
        >
          Готуємо твій код…
        </Text>
      )}

      {memberCode ? (
        <>
          <Text
            selectable
            testID="member-code"
            style={{
              fontSize: t.font.size["2xl"] - 4,
              fontVariant: ["tabular-nums"],
              letterSpacing: 3,
              fontFamily: fontFamily.body.semibold,
              color: t.c.foreground,
              textAlign: "center",
            }}
          >
            {formatMemberCode(memberCode)}
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontFamily: fontFamily.body.regular,
              color: t.c["text-muted"],
              textAlign: "center",
            }}
          >
            Не сканується? Продиктуй кавовару цей код
          </Text>
        </>
      ) : null}
    </View>
  );
}
