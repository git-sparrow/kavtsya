import type { ShiftsResponse } from "@kavtsya/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, OwnerBadge, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { fetchShifts, revokeShift } from "@/lib/api";
import { theme } from "@/theme";

/** An instant as the wall-clock time the owner reasons in. */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The owner's «Зміна» board (#98/#99, ADR 0013): who is behind the counter
 * right now, and one tap to end a shift early. Shifts START from the barista
 * scanning the wall poster (see the Roster board for the code to print) — the
 * owner does nothing to begin one, so this screen is watch-and-end only.
 * Forgotten shifts end themselves at the rolling cap; ending here is for "left
 * at lunch" and instant off-boarding.
 */
export default function OwnerShifts() {
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafeName = me?.cafes.find((cafe) => cafe.id === cafeId)?.name ?? "";

  const [shifts, setShifts] = useState<ShiftsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reloadShifts() {
    try {
      setShifts(await fetchShifts(cafeId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити зміни");
    }
  }

  useEffect(() => {
    let active = true;
    void fetchShifts(cafeId)
      .then((loaded) => {
        if (active) setShifts(loaded);
      })
      .catch((e: unknown) => {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Не вдалося завантажити зміни",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [cafeId]);

  async function endShift(grantId: string) {
    setBusy(true);
    try {
      await revokeShift(cafeId, grantId);
      setError(null);
      await reloadShifts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завершити зміну");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <OwnerBadge>Зміна — {cafeName}</OwnerBadge>

        <Muted>
          Бариста починають зміну самі — сканують постер кав&apos;ярні зі свого
          застосунку. Код постера — у «Ростері бариста».
        </Muted>

        <Title>На зміні</Title>
        {shifts === null ? (
          <ActivityIndicator color={theme.c.foreground} />
        ) : shifts.length === 0 ? (
          <Muted>
            {"Наразі нікого — бариста з'явиться тут, щойно відкриє зміну."}
          </Muted>
        ) : (
          shifts.map((shift) => (
            <View key={shift.id} style={styles.shiftRow}>
              <Title>{shift.baristaName}</Title>
              <Muted>до {timeOf(shift.expiresAt)}</Muted>
              <Button
                title="Завершити зміну"
                variant="secondary"
                disabled={busy}
                onPress={() => void endShift(shift.id)}
              />
            </View>
          ))
        )}
        <Button
          title="Оновити"
          variant="secondary"
          disabled={busy}
          onPress={() => void reloadShifts()}
        />

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
  shiftRow: {
    borderWidth: 1,
    borderColor: theme.c.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[3],
    gap: theme.space[2],
  },
});
