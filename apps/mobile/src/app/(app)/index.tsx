import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { CustomerMode } from "@/features/mode/customer-mode";
import { useMode } from "@/features/mode/mode-context";
import { OwnerMode } from "@/features/mode/owner-mode";
import { ScannerMode } from "@/features/mode/scanner-mode";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/theme";

/**
 * The Mode dispatcher (#96, ADR 0015). The app opens here and renders exactly
 * one of the three surfaces, chosen fresh from live account facts — active
 * Shift → Scanner; else CafeOwner → CafeOwner; else Customer. Nothing is
 * persisted: the landing re-derives on every focus (a returning excursion, a
 * finished sub-screen, a foreground), so the visible Mode never lags server
 * truth.
 */
export default function Home() {
  const t = useTheme();
  const { me, error, reload } = useMe();
  const { mode, loading, reloadShift } = useMode();

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadShift();
    }, [reload, reloadShift]),
  );

  if (error) {
    return (
      <Screen>
        <Card>
          <ErrorText>{error}</ErrorText>
          <Button
            title="Спробувати знову"
            variant="secondary"
            onPress={() => void reload()}
          />
          <Button
            title="Вийти"
            variant="secondary"
            onPress={() => authClient.signOut()}
          />
        </Card>
      </Screen>
    );
  }

  if (loading || !me) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={t.c.foreground} />
      </Screen>
    );
  }

  if (mode === "scanner") return <ScannerMode />;
  if (mode === "owner") return <OwnerMode />;
  return <CustomerMode />;
}
