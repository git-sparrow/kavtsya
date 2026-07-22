import { formatMemberCode } from "@kavtsya/shared";
import { Text, View } from "react-native";

import { Button } from "@/components/button";
import { QRPlate } from "@/components/qr-plate";
import { StatusStrip } from "@/components/status-strip";
import { Surface } from "@/components/surface";
import { fontFamily, useTheme } from "@/theme";

import { useMemberCode } from "./use-member-code";
import { useQrToken } from "./use-qr-token";

/**
 * The Customer's QR area on the home (ADR 0006): the CafeOwner scans it to record
 * a Purchase. Normally a white QRPlate that rotates its own token (`useQrToken`)
 * with the member-code fallback beneath. On a fetch failure the hierarchy
 * inverts (1d/1n): the member code becomes the hero on a `primary-surface` card —
 * dictating it earns the Зернятко just the same — and the failure drops to a
 * quiet danger strip with a retry. The loading state (1c/1m) lives inside
 * QRPlate (a reserved square), so the layout never jumps.
 */
export function CustomerQr() {
  const t = useTheme();
  const { token, error, reload } = useQrToken();
  const memberCode = useMemberCode();

  if (error) {
    return (
      <View style={{ alignSelf: "stretch", gap: t.space[3] }}>
        {memberCode ? (
          <Surface emphasis="promise" style={{ alignItems: "center", gap: 8 }}>
            <Text
              selectable
              numberOfLines={1}
              style={{
                fontSize: t.font.size["2xl"],
                fontVariant: ["tabular-nums"],
                letterSpacing: 3,
                fontFamily: fontFamily.body.semibold,
                color: t.c.foreground,
              }}
            >
              {formatMemberCode(memberCode)}
            </Text>
            <Text
              style={{
                fontSize: 13.5,
                lineHeight: 20,
                fontFamily: fontFamily.body.regular,
                color: t.c["text-secondary"],
                textAlign: "center",
              }}
            >
              Продиктуй кавовару — зернятко зарахується так само
            </Text>
          </Surface>
        ) : null}
        <StatusStrip
          intent="danger"
          title="Немає з'єднання — QR тимчасово недоступний"
        />
        <Button title="Спробувати знову" variant="secondary" onPress={reload} />
      </View>
    );
  }

  return (
    <Surface style={{ alignItems: "center" }}>
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 16,
          fontFamily: fontFamily.body.semibold,
          color: t.c.foreground,
        }}
      >
        Твій код учасника
      </Text>
      <QRPlate token={token} memberCode={memberCode} />
    </Surface>
  );
}
