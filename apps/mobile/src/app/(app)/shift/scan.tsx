import { router } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, OwnerBadge } from "@/components/text";
import { ScanWorkstation } from "@/features/scan/scan-workstation";
import { useMyShift } from "@/features/shift/use-my-shift";
import { theme } from "@/theme";

/** An instant as the wall-clock time the barista reasons in. */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Scanner mode (#80, ADR 0013): the shared counter workstation framed with the
 * persistent shift banner — always visible which Café's hat is on and until
 * when — and an obvious exit. Scan + Redemption confirm is ALL a shift grants;
 * exiting just leaves the mode (the grant itself ends by expiry or the owner's
 * revoke).
 */
export default function ShiftScan() {
  const { shift, error, reload } = useMyShift();

  if (shift === undefined) {
    return (
      <Screen>
        {error ? (
          <Card>
            <ErrorText>{error}</ErrorText>
            <Button
              title="Спробувати знову"
              variant="secondary"
              onPress={() => void reload()}
            />
            <Button
              title="На головну"
              variant="secondary"
              onPress={() => router.replace("/")}
            />
          </Card>
        ) : (
          <ActivityIndicator size="large" color={theme.c.foreground} />
        )}
      </Screen>
    );
  }

  if (shift === null) {
    return (
      <Screen>
        <Card>
          <OwnerBadge>Зміна</OwnerBadge>
          <Muted>
            Активної зміни немає — вона закінчилася або її завершив кавовар.
            Попросіть нове запрошення, щоб продовжити.
          </Muted>
          <Button
            title="На головну"
            variant="secondary"
            onPress={() => router.replace("/")}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <ScanWorkstation
      cafeId={shift.cafeId}
      header={
        <View style={styles.banner}>
          <OwnerBadge>Зміна — {shift.cafeName}</OwnerBadge>
          <Muted>до {timeOf(shift.expiresAt)}</Muted>
        </View>
      }
      exit={
        <Button
          title="Вийти зі зміни"
          variant="secondary"
          onPress={() => router.replace("/")}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderColor: theme.c["border-strong"],
    borderRadius: theme.radius.md,
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[3],
    gap: 2,
  },
});
