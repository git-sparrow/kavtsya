import type { PosterScanResult } from "@kavtsya/shared";
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
import { useMode } from "@/features/mode/mode-context";
import { scanPoster } from "@/lib/api";
import { theme } from "@/theme";

// Same React 19 strict-JSX workaround as scan-workstation.tsx.
const CameraView = CameraViewBase as unknown as ComponentType<CameraViewProps>;

/** Side of the camera viewfinder square, in dp. */
const VIEWFINDER_SIZE = 260;

/**
 * The barista scans a Café's wall poster (#98/#99, ADR 0013): with their OWN
 * account, one scan does one of three things. A rostered barista starts a Shift
 * and lands in the near-kiosk Scanner Mode. A stranger raises a request the
 * owner approves — a reassuring terminal state. A barista already on shift
 * elsewhere is asked to switch, then re-scans to confirm. Security rests on the
 * roster, not the poster: the code only ever identifies the Café.
 */
export default function ScanPosterScreen() {
  const { reloadShift } = useMode();
  const [permission, requestPermission] = useCameraPermissions();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedCode, setTypedCode] = useState("");
  const [pending, setPending] = useState<{ cafeName: string } | null>(null);
  // A pending switch: the code scanned + the Café we'd leave, awaiting confirm.
  const [switchTo, setSwitchTo] = useState<{
    posterCode: string;
    cafeName: string;
    currentCafeName: string;
  } | null>(null);
  // The camera emits the same barcode many times a second — gate it.
  const inFlight = useRef(false);

  async function handleResult(result: PosterScanResult, posterCode: string) {
    if (result.status === "shift_started") {
      // The new grant makes the dispatcher land on Scanner Mode.
      await reloadShift();
      router.replace("/");
      return;
    }
    if (result.status === "switch_required") {
      setSwitchTo({
        posterCode,
        cafeName: result.cafeName,
        currentCafeName: result.currentCafeName,
      });
      return;
    }
    // pending
    setPending({ cafeName: result.cafeName });
  }

  async function submit(posterCode: string, confirmSwitch?: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      const result = await scanPoster(posterCode, confirmSwitch);
      setError(null);
      await handleResult(result, posterCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося обробити скан");
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
  if (pending) {
    return (
      <Screen>
        <Card>
          <OwnerBadge>Запит надіслано</OwnerBadge>
          <Title>{pending.cafeName}</Title>
          <Muted>
            Кавовар отримав ваш запит. Щойно вас підтвердять, скануйте постер ще
            раз на початку зміни — і ви станете за касу.
          </Muted>
          <Button title="Готово" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  // A shift already runs at another Café: confirm the switch before stealing the
  // barista off their current post (#99).
  if (switchTo) {
    return (
      <Screen>
        <Card>
          <OwnerBadge>Уже на зміні</OwnerBadge>
          <Muted>
            Ви зараз на зміні в «{switchTo.currentCafeName}». Завершити її та
            почати зміну в «{switchTo.cafeName}»?
          </Muted>
          <Button
            title={`Перейти в «${switchTo.cafeName}»`}
            busy={sending}
            onPress={() => void submit(switchTo.posterCode, true)}
          />
          <Button
            title="Скасувати"
            variant="secondary"
            disabled={sending}
            onPress={() => setSwitchTo(null)}
          />
          {error && <ErrorText>{error}</ErrorText>}
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
              Наведіть камеру на постер кав&apos;ярні. Якщо ви вже в ростері —
              почнеться зміна; якщо ні — кавовар отримає ваш запит.
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
                title="Продовжити за кодом"
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
