import {
  CameraView as CameraViewBase,
  type CameraViewProps,
  useCameraPermissions,
} from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import type { ComponentType } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, OwnerBadge, Title } from "@/components/text";
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
  const { state, onScanned, scanNext } = useScanPurchase(cafeId);

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
          <Muted>Наведіть камеру на QR-код клієнта</Muted>
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
            {state.result.balance >= state.result.threshold &&
              state.result.reward && (
                <Muted>
                  Назбирано на винагороду: {rewardLabel(state.result.reward)}
                </Muted>
              )}
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
