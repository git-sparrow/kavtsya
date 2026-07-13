import { isWellFormedMemberCode, normalizeMemberCode } from "@kavtsya/shared";
import {
  CameraView as CameraViewBase,
  type CameraViewProps,
  useCameraPermissions,
} from "expo-camera";
import { router } from "expo-router";
import type { ComponentType } from "react";
import { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, OwnerBadge } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useMode } from "@/features/mode/mode-context";
import { acceptShiftInvite } from "@/lib/api";
import { theme } from "@/theme";

// Same React 19 strict-JSX workaround as scan-workstation.tsx.
const CameraView = CameraViewBase as unknown as ComponentType<CameraViewProps>;

/** Side of the camera viewfinder square, in dp. */
const VIEWFINDER_SIZE = 260;

/**
 * The barista joins a «Зміна» (#80): scan the invite QR the owner is showing,
 * or type its short code — with their OWN account, never the owner's login.
 * A successful accept replaces this screen with the scanner mode.
 */
export default function JoinShift() {
  const { reloadShift } = useMode();
  const [permission, requestPermission] = useCameraPermissions();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedCode, setTypedCode] = useState("");
  // The camera emits the same barcode many times a second — gate like the
  // scan workstation does.
  const inFlight = useRef(false);

  async function accept(
    invite: { inviteToken: string } | { inviteCode: string },
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      await acceptShiftInvite(invite);
      // Re-derive the Mode: the new grant makes the dispatcher land on Scanner.
      await reloadShift();
      router.replace("/");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не вдалося долучитися до зміни",
      );
      inFlight.current = false;
      setSending(false);
    }
  }

  function submitTypedCode() {
    const normalized = normalizeMemberCode(typedCode);
    if (!isWellFormedMemberCode(normalized)) {
      setError("Код — 8 літер і цифр, наприклад K7Q4-M2ZX");
      return;
    }
    setError(null);
    void accept({ inviteCode: normalized });
  }

  if (!permission) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={theme.c.foreground} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <OwnerBadge>Долучитися до зміни</OwnerBadge>

        {permission.granted ? (
          <View style={styles.viewfinder}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={
                sending
                  ? undefined
                  : ({ data }) => void accept({ inviteToken: data })
              }
            />
          </View>
        ) : (
          <>
            <Muted>
              Щоб сканувати запрошення, потрібен доступ до камери — або введіть
              код нижче.
            </Muted>
            <Button
              title="Дозволити камеру"
              variant="secondary"
              onPress={() => void requestPermission()}
            />
          </>
        )}

        {sending ? (
          <ActivityIndicator color={theme.c.foreground} />
        ) : (
          <>
            <Muted>
              Наведіть камеру на QR-запрошення кавовара — зміна триватиме з
              вашого акаунта, зернятка залишаться вашими.
            </Muted>
            <TextField
              value={typedCode}
              onChangeText={setTypedCode}
              placeholder="Або введіть код запрошення"
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={submitTypedCode}
            />
            {typedCode.length > 0 && (
              <Button
                title="Долучитися за кодом"
                variant="secondary"
                onPress={submitTypedCode}
              />
            )}
          </>
        )}
        {error && <ErrorText>{error}</ErrorText>}

        <Button
          title="Назад"
          variant="secondary"
          onPress={() => router.back()}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewfinder: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
    alignSelf: "center",
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.c.border,
  },
});
