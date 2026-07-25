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
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { BackHeader } from "@/components/back-header";
import { Button } from "@/components/button";
import { Screen } from "@/components/screen";
import { StatusStrip } from "@/components/status-strip";
import { Surface } from "@/components/surface";
import { Muted } from "@/components/text";
import { TextField } from "@/components/text-field";
import { WaitingState } from "@/components/waiting-state";
import { useMode } from "@/features/mode/mode-context";
import { scanPoster } from "@/lib/api";
import { fontFamily, ThemeProvider, useTheme } from "@/theme";

// Same React 19 strict-JSX workaround as scan-workstation.tsx.
const CameraView = CameraViewBase as unknown as ComponentType<CameraViewProps>;

/**
 * The barista scans a Café's wall poster (#98/#99, ADR 0013; redesign turn
 * 5e/5f): with their OWN account, one scan does one of three things. A rostered
 * barista starts a Shift and lands in the near-kiosk Scanner Mode. A stranger
 * raises a request the owner approves — the shared waiting-state (5f). A barista
 * already on shift elsewhere is asked to switch, then re-scans to confirm.
 * Camera-first with the trust rule shown BEFORE the scan (ADR 0013: access is
 * the owner's confirmation, not the code). Follows the OS colour scheme.
 */
export default function ScanPosterScreen() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <ThemeProvider theme={scheme}>
      <ScanPosterBody />
    </ThemeProvider>
  );
}

/** Corner brackets over the viewfinder — the «наведи камеру» framing (5e). */
function ViewfinderBrackets() {
  const t = useTheme();
  const arm = 34;
  const thickness = 3;
  const inset = 22;
  const base = {
    position: "absolute" as const,
    width: arm,
    height: arm,
    borderColor: t.c.primary,
  };
  return (
    <>
      <View
        style={{
          ...base,
          top: inset,
          left: inset,
          borderTopWidth: thickness,
          borderLeftWidth: thickness,
          borderTopLeftRadius: 8,
        }}
      />
      <View
        style={{
          ...base,
          top: inset,
          right: inset,
          borderTopWidth: thickness,
          borderRightWidth: thickness,
          borderTopRightRadius: 8,
        }}
      />
      <View
        style={{
          ...base,
          bottom: inset,
          left: inset,
          borderBottomWidth: thickness,
          borderLeftWidth: thickness,
          borderBottomLeftRadius: 8,
        }}
      />
      <View
        style={{
          ...base,
          bottom: inset,
          right: inset,
          borderBottomWidth: thickness,
          borderRightWidth: thickness,
          borderBottomRightRadius: 8,
        }}
      />
    </>
  );
}

function ScanPosterBody() {
  const t = useTheme();
  const { reloadShift } = useMode();
  const [permission, requestPermission] = useCameraPermissions();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [typedCode, setTypedCode] = useState("");
  // A terminal state: a landed request (5f waiting) or "this is your café" (info).
  const [terminal, setTerminal] = useState<{
    kind: "pending" | "owner_cafe";
    cafeName: string;
    message: string;
  } | null>(null);
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
    if (result.status === "owner_cafe") {
      // The owner scanned their own poster — nothing to start; point them back
      // to CafeOwner Mode's own scan.
      setTerminal({
        kind: "owner_cafe",
        cafeName: result.cafeName,
        message:
          "Клієнтів скануй зі свого екрана — «Сканувати QR клієнта». Постер — для бариста.",
      });
      return;
    }
    // pending — the shared waiting-state (5f).
    setTerminal({
      kind: "pending",
      cafeName: result.cafeName,
      message: `Кав'ярня «${result.cafeName}» · чекаємо на підтвердження Кавовара. Сповістимо, щойно він підтвердить.`,
    });
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

  // Terminal: the request landed (5f waiting-state) — the owner takes it from
  // here; nothing more to do on this device.
  if (terminal?.kind === "pending") {
    return (
      <Screen
        header={<View accessibilityElementsHidden style={{ height: 0 }} />}
      >
        <WaitingState
          testID="request-sent"
          title="Запит надіслано"
          body={terminal.message}
          primaryAction={{
            label: "Добре",
            testID: "request-sent-done",
            onPress: () => router.back(),
          }}
        />
      </Screen>
    );
  }

  // Terminal: the owner scanned their own poster — informational, not a wait.
  if (terminal?.kind === "owner_cafe") {
    return (
      <Screen header={<BackHeader title="Приєднатися до кав'ярні" />}>
        <StatusStrip
          testID="request-owner-cafe"
          intent="info"
          title="Це твоя кав'ярня"
          detail={terminal.message}
        />
        <View style={{ flex: 1 }} />
        <Button title="Готово" onPress={() => router.back()} />
      </Screen>
    );
  }

  // A shift already runs at another Café: confirm the switch before stealing the
  // barista off their current post (#99).
  if (switchTo) {
    return (
      <Screen header={<BackHeader title="Уже на зміні" />}>
        <Surface emphasis="promise">
          <Text
            style={{
              fontSize: t.font.size.base,
              lineHeight: t.font.size.base * t.font.lineHeight.snug,
              fontFamily: fontFamily.body.regular,
              color: t.c.foreground,
            }}
          >
            Ти зараз на зміні в «{switchTo.currentCafeName}». Завершити її та
            почати зміну в «{switchTo.cafeName}»?
          </Text>
        </Surface>
        {error && <StatusStrip intent="danger" title={error} />}
        <View style={{ flex: 1 }} />
        <Button
          title={`Перейти в «${switchTo.cafeName}»`}
          testID="request-switch-confirm"
          busy={sending}
          onPress={() => void submit(switchTo.posterCode, true)}
        />
        <Button
          title="Скасувати"
          variant="quiet"
          disabled={sending}
          onPress={() => setSwitchTo(null)}
        />
      </Screen>
    );
  }

  if (!permission) {
    return (
      <Screen header={<BackHeader title="Приєднатися до кав'ярні" />}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator size="large" color={t.c.foreground} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen header={<BackHeader title="Приєднатися до кав'ярні" />}>
      <Muted style={{ textAlign: "left" }}>
        Бариста? Скануй постер Кавці біля каси своєї кав&apos;ярні.
      </Muted>

      {/* The viewfinder — a fixed-dark framed card (a camera preview reads dark
          in both themes), gold corner brackets, caption under the frame. */}
      <View style={styles.viewfinder}>
        {permission.granted && !sending ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={
              sending ? undefined : ({ data }) => void submit(data)
            }
          />
        ) : null}
        <ViewfinderBrackets />
        {sending ? (
          <ActivityIndicator
            color={t.c.primary}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={styles.viewfinderCaption}>
          {permission.granted ? (
            <Text style={captionStyle(t)}>Наведи камеру на код постера</Text>
          ) : (
            // Permission not granted: a light caption + a gold CTA — a
            // `secondary` button's dark label would vanish on the dark
            // viewfinder ground, so this stays a legible `primary`.
            <View style={{ alignSelf: "stretch", gap: t.space[3] }}>
              <Text style={captionStyle(t)}>
                Дозволь доступ до камери, щоб сканувати
              </Text>
              <Button
                title="Дозволити камеру"
                onPress={() => void requestPermission()}
              />
            </View>
          )}
        </View>
      </View>

      {/* The trust rule, shown before the scan (ADR 0013). */}
      <Surface emphasis="promise">
        <Muted
          style={{
            fontSize: t.font.size.base,
            lineHeight: t.font.size.base * t.font.lineHeight.snug,
            color: t.c.foreground,
          }}
        >
          Доступ підтверджує Кавовар — твій запит з&apos;явиться в нього в
          Ростері.
        </Muted>
      </Surface>

      {/* Manual entry — hidden until asked (camera-first). */}
      {manual ? (
        <View style={{ gap: t.space[2] }}>
          <TextField
            testID="request-code"
            value={typedCode}
            onChangeText={setTypedCode}
            placeholder="Код з постера, напр. K7Q4-M2ZX"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={submitTypedCode}
          />
          <Button
            title="Продовжити за кодом"
            testID="request-code-submit"
            disabled={typedCode.length === 0}
            onPress={submitTypedCode}
          />
        </View>
      ) : null}

      {error && <StatusStrip intent="danger" title={error} />}

      {!manual && (
        <>
          <View style={{ flex: 1 }} />
          <Button
            title="Ввести код вручну"
            variant="secondary"
            testID="request-manual"
            onPress={() => setManual(true)}
          />
        </>
      )}
    </Screen>
  );
}

function captionStyle(t: ReturnType<typeof useTheme>) {
  return {
    fontSize: t.font.size.sm,
    fontFamily: fontFamily.body.semibold,
    // Fixed light on the always-dark viewfinder ground.
    color: t.color.neutral[100],
    textAlign: "center" as const,
  };
}

const styles = StyleSheet.create({
  viewfinder: {
    alignSelf: "stretch",
    height: 300,
    borderRadius: 20,
    overflow: "hidden",
    // Theme-invariant deep indigo — a camera preview is dark in both themes.
    backgroundColor: "#241b3a",
    justifyContent: "flex-end",
  },
  viewfinderCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: "center",
    paddingHorizontal: 16,
  },
});
