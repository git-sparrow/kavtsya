import { formatMemberCode } from "@kavtsya/shared";
import type { ComponentType } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import QRCodeBase, { type QRCodeProps } from "react-native-qrcode-svg";

import { Button } from "@/components/button";
import { ErrorText, Muted } from "@/components/text";
import { fontFamily, theme } from "@/theme";

import { useMemberCode } from "./use-member-code";
import { useQrToken } from "./use-qr-token";

// react-native-qrcode-svg ships its default export as an empty
// `declare class … extends React.PureComponent` body, which React 19's stricter
// JSX element typing rejects. The runtime component is correct — only the type
// needs coercing to a plain component type.
const QRCode = QRCodeBase as unknown as ComponentType<QRCodeProps>;

/** Side of the rendered QR square, in dp. */
const QR_SIZE = 220;

/**
 * The Customer's rotating QR code (ADR 0006): the CafeOwner scans it to record a
 * Purchase. It refreshes itself before each token expires via `useQrToken`; the
 * Customer just holds the phone up. While the first token loads we reserve the
 * square so the layout doesn't jump, and a fetch failure offers a manual retry.
 */
export function CustomerQr() {
  const { token, error, reload } = useQrToken();
  const memberCode = useMemberCode();

  return (
    <View style={styles.container}>
      <View style={styles.frame}>
        {token ? (
          <QRCode value={token} size={QR_SIZE} color={theme.c.foreground} />
        ) : (
          <ActivityIndicator size="large" color={theme.c.foreground} />
        )}
      </View>

      {error ? (
        <>
          <ErrorText>{error}</ErrorText>
          <Button
            title="Спробувати знову"
            variant="secondary"
            onPress={reload}
          />
        </>
      ) : (
        <Muted>Покажіть кавовару, щоб отримати зернятко</Muted>
      )}

      {/* The offline fallback (#21): always visible, cached on the device —
          it also rescues a bad camera read, not only a dead connection. */}
      {memberCode && (
        <>
          <Text selectable style={styles.memberCode}>
            {formatMemberCode(memberCode)}
          </Text>
          <Muted>Не сканується? Продиктуйте кавовару цей код</Muted>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: theme.space[3],
  },
  frame: {
    width: QR_SIZE,
    height: QR_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  memberCode: {
    fontSize: 24,
    fontVariant: ["tabular-nums"],
    letterSpacing: 3,
    fontFamily: fontFamily.body.semibold,
    color: theme.c.foreground,
    textAlign: "center",
  },
});
