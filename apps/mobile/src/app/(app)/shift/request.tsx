import type { RosterRequestResult } from "@kavtsya/shared";
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
import { ErrorText, Muted, OwnerBadge, Title } from "@/components/text";
import { TextField } from "@/components/text-field";
import { requestRoster } from "@/lib/api";
import { theme } from "@/theme";

// Same React 19 strict-JSX workaround as scan-workstation.tsx.
const CameraView = CameraViewBase as unknown as ComponentType<CameraViewProps>;

/** Side of the camera viewfinder square, in dp. */
const VIEWFINDER_SIZE = 260;

/**
 * The barista requests a Café's Barista Roster (#97, ADR 0013): scan the wall
 * poster the café prints, or type its code — with their OWN account. Unlike the
 * transitional invite join (#80), this grants nothing on its own: it raises a
 * request the owner approves. Starting a Shift from a rostered scan is #98.
 */
export default function RequestRoster() {
  const [permission, requestPermission] = useCameraPermissions();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedCode, setTypedCode] = useState("");
  const [result, setResult] = useState<RosterRequestResult | null>(null);
  // The camera emits the same barcode many times a second — gate it.
  const inFlight = useRef(false);

  async function submit(posterCode: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      setResult(await requestRoster(posterCode));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося надіслати запит");
    } finally {
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
    void submit(normalized);
  }

  // A landed request is a terminal, reassuring state — the owner takes it from
  // here, so there is nothing more for the barista to do but wait.
  if (result) {
    return (
      <Screen>
        <Card>
          <OwnerBadge>Запит надіслано</OwnerBadge>
          <Title>{result.cafeName}</Title>
          <Muted>
            {result.status === "rostered"
              ? "Ви вже у ростері цієї кав'ярні. Скануйте постер на початку зміни, щоб стати за касу."
              : "Кавовар отримав ваш запит. Щойно вас підтвердять, ви зможете відкривати зміну, сканувавши постер."}
          </Muted>
          <Button title="Готово" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
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
        <OwnerBadge>Приєднатися до кав&apos;ярні</OwnerBadge>

        {permission.granted ? (
          <View style={styles.viewfinder}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={
                sending ? undefined : ({ data }) => void submit(data)
              }
            />
          </View>
        ) : (
          <>
            <Muted>
              Щоб сканувати постер, потрібен доступ до камери — або введіть код
              нижче.
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
              Наведіть камеру на постер кав&apos;ярні — ваш запит отримає
              кавовар і підтвердить вас у ростері.
            </Muted>
            <TextField
              value={typedCode}
              onChangeText={setTypedCode}
              placeholder="Або введіть код з постера"
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={submitTypedCode}
            />
            {typedCode.length > 0 && (
              <Button
                title="Надіслати запит"
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
