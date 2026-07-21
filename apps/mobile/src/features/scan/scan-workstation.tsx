import type { PurchaseResult, Reward } from "@kavtsya/shared";
import {
  isRedemptionReady,
  isWellFormedMemberCode,
  normalizeMemberCode,
} from "@kavtsya/shared";
import {
  CameraView as CameraViewBase,
  type CameraViewProps,
  useCameraPermissions,
} from "expo-camera";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, Title } from "@/components/text";
import { TextField } from "@/components/text-field";
import { rewardLabel } from "@/features/loyalty/reward";
import { useScanPurchase } from "@/features/scan/use-scan-purchase";
import { theme } from "@/theme";

// Same React 19 strict-JSX workaround as react-native-qrcode-svg in
// customer-qr.tsx: expo-camera declares CameraView as a class whose type React
// 19 rejects; the runtime component is fine, only the type needs coercing.
const CameraView = CameraViewBase as unknown as ComponentType<CameraViewProps>;

/** Side of the camera viewfinder square, in dp. */
const VIEWFINDER_SIZE = 260;

/**
 * Whether the confirm-Redemption action is offered (#22, CONTEXT → Redemption):
 * the balance covers the Café's threshold and there is a Reward to claim. The
 * server re-checks under its lock — this only decides what the screen shows.
 */
function canRedeem(
  result: PurchaseResult,
): result is PurchaseResult & { reward: Reward } {
  return isRedemptionReady(result);
}

export interface ScanWorkstationProps {
  /** The Café every scan is issued at. */
  cafeId: string;
  /** Top of the card: the owner's badge, or the shift banner (#80). */
  header: ReactNode;
  /** Bottom of the card: leave the screen (owner's «Назад», shift's exit). */
  exit: ReactNode;
}

/**
 * The counter workstation (#20, #21, #22): camera on the Customer's rotating
 * QR, typed member-code fallback, held outcome, Redemption confirm. One
 * component because the shift's scanner mode (#80) IS the owner's scan screen
 * — same two powers, only the frame (header/exit) differs.
 */
export function ScanWorkstation({
  cafeId,
  header,
  exit,
}: ScanWorkstationProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const { state, onScanned, onMemberCode, confirmRedemption, scanNext } =
    useScanPurchase(cafeId);
  // The offline fallback (#21): what has been typed of the Customer's member
  // code, and the local malformed-input message (server rejections take the
  // same "rejected" path a bad scan does).
  const [typedCode, setTypedCode] = useState("");
  const [typedCodeError, setTypedCodeError] = useState<string | null>(null);

  function submitTypedCode() {
    const normalized = normalizeMemberCode(typedCode);
    if (!isWellFormedMemberCode(normalized)) {
      setTypedCodeError("Код — 8 літер і цифр, наприклад K7Q4-M2ZX");
      return;
    }
    setTypedCodeError(null);
    setTypedCode("");
    void onMemberCode(normalized);
  }

  if (!permission) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={theme.c.foreground} />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Card>
          {header}
          <Muted>
            Щоб сканувати QR-код клієнта, потрібен доступ до камери.
          </Muted>
          <Button
            title="Дозволити камеру"
            onPress={() => void requestPermission()}
          />
          {exit}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        {header}

        <View style={styles.viewfinder}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={
              state.phase === "scanning"
                ? ({ data }) => void onScanned(data)
                : undefined
            }
          />
        </View>

        {state.phase === "scanning" && (
          <>
            <Muted>Наведіть камеру на QR-код клієнта</Muted>
            {/* The offline fallback (#21): a failed scan never dead-ends the
                sale — type the member code from beneath the Customer's QR. */}
            <TextField
              value={typedCode}
              onChangeText={setTypedCode}
              placeholder="Або введіть код клієнта"
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={submitTypedCode}
            />
            {typedCodeError && <ErrorText>{typedCodeError}</ErrorText>}
            {typedCode.length > 0 && (
              <Button
                title="Нарахувати за кодом"
                variant="secondary"
                onPress={submitTypedCode}
              />
            )}
          </>
        )}
        {state.phase === "sending" && (
          <ActivityIndicator color={theme.c.foreground} />
        )}
        {state.phase === "issued" && (
          <>
            <Title>✓ {state.result.customerName}</Title>
            <Muted>
              Зернятка: {state.result.balance} з {state.result.threshold}
            </Muted>
            {/* Ворожка (#23): the scan moment — show the Customer their fortune. */}
            <Muted>☕ «{state.result.fortune}»</Muted>
            {canRedeem(state.result) && (
              <>
                <Muted>
                  Назбирано на винагороду: {rewardLabel(state.result.reward)}
                </Muted>
                <Button
                  title="Видати винагороду"
                  onPress={() => void confirmRedemption()}
                />
              </>
            )}
            {state.confirmError && <ErrorText>{state.confirmError}</ErrorText>}
            <Button title="Сканувати ще" onPress={scanNext} />
          </>
        )}
        {state.phase === "confirming" && (
          <ActivityIndicator color={theme.c.foreground} />
        )}
        {state.phase === "redeemed" && (
          <>
            <Title>🎁 Винагороду видано</Title>
            <Muted>{rewardLabel(state.redemption.reward)}</Muted>
            <Muted>
              Залишок: {state.result.balance} з {state.result.threshold}
            </Muted>
            {/* A banked balance (≥ 2× threshold) redeems again — its own confirm. */}
            {canRedeem(state.result) && (
              <Button
                title="Видати ще одну"
                onPress={() => void confirmRedemption()}
              />
            )}
            {state.confirmError && <ErrorText>{state.confirmError}</ErrorText>}
            <Button title="Сканувати ще" onPress={scanNext} />
          </>
        )}
        {state.phase === "rejected" && (
          <>
            <ErrorText>{state.message}</ErrorText>
            <Button title="Сканувати ще" onPress={scanNext} />
          </>
        )}

        {exit}
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
