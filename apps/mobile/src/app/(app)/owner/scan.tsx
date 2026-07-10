import type { PurchaseResult, Reward } from "@kavtsya/shared";
import { isWellFormedMemberCode, normalizeMemberCode } from "@kavtsya/shared";
import {
  CameraView as CameraViewBase,
  type CameraViewProps,
  useCameraPermissions,
} from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import type { ComponentType } from "react";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, OwnerBadge, Title } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useMe } from "@/features/account/me-context";
import { rewardLabel } from "@/features/loyalty/reward";
import { useScanPurchase } from "@/features/scan/use-scan-purchase";
import { colors, radius } from "@/theme/colors";

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
  return result.balance >= result.threshold && result.reward !== null;
}

/**
 * The CafeOwner's scan screen (#20): point the camera at the Customer's
 * rotating QR, the API validates it and appends the Purchase, and the outcome —
 * who earned the Зернятко, their new balance, or why the scan was rejected —
 * stays on screen until the CafeOwner scans the next Customer.
 */
export default function ScanPurchase() {
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafeName = me?.cafes.find((cafe) => cafe.id === cafeId)?.name ?? "";
  const [permission, requestPermission] = useCameraPermissions();
  const { state, onScanned, onMemberCode, confirmRedemption, scanNext } =
    useScanPurchase(cafeId);
  // The offline fallback (#21): what the CafeOwner has typed of the Customer's
  // member code, and the local malformed-input message (server rejections take
  // the same "rejected" path a bad scan does).
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
        <ActivityIndicator size="large" color={colors.brand} />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Card>
          <OwnerBadge>{cafeName}</OwnerBadge>
          <Muted>
            Щоб сканувати QR-код клієнта, потрібен доступ до камери.
          </Muted>
          <Button
            title="Дозволити камеру"
            onPress={() => void requestPermission()}
          />
          <Button
            title="Назад"
            variant="secondary"
            onPress={() => router.back()}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <OwnerBadge>{cafeName}</OwnerBadge>

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
          <ActivityIndicator color={colors.brand} />
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
          <ActivityIndicator color={colors.brand} />
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
    borderRadius: radius,
    overflow: "hidden",
    backgroundColor: colors.border,
  },
});
