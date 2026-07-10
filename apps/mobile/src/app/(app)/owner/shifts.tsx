import type { ShiftInviteResponse, ShiftsResponse } from "@kavtsya/shared";
import { formatMemberCode } from "@kavtsya/shared";
import { router, useLocalSearchParams } from "expo-router";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import QRCodeBase, { type QRCodeProps } from "react-native-qrcode-svg";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, OwnerBadge, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { fetchShifts, openShiftInvite, revokeShift } from "@/lib/api";
import { colors, radius } from "@/theme/colors";

// Same React 19 strict-JSX workaround as customer-qr.tsx.
const QRCode = QRCodeBase as unknown as ComponentType<QRCodeProps>;

/** Side of the rendered invite QR square, in dp. */
const QR_SIZE = 200;

/** A trial barista's window (#80, user story 7), in minutes. */
const TRIAL_SHIFT_MINUTES = 120;

/** An instant as the wall-clock time the owner reasons in. */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The owner's «Зміна» board (#80, ADR 0013): open a shift (mint the invite QR
 * + short code the barista accepts with their own account), «Запросити ще»
 * for the next barista, see who is on shift, and end one early. Forgotten
 * shifts end themselves at closing time — revocation is for "left at lunch".
 */
export default function OwnerShifts() {
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafeName = me?.cafes.find((cafe) => cafe.id === cafeId)?.name ?? "";

  const [invite, setInvite] = useState<ShiftInviteResponse | null>(null);
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

  async function mintInvite(durationMinutes?: number) {
    setBusy(true);
    try {
      setInvite(await openShiftInvite(cafeId, durationMinutes));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося відкрити зміну");
    } finally {
      setBusy(false);
    }
  }

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

        {invite ? (
          <>
            <View style={styles.qrFrame}>
              <QRCode
                value={invite.inviteToken}
                size={QR_SIZE}
                color={colors.brand}
              />
            </View>
            <Text selectable style={styles.inviteCode}>
              {formatMemberCode(invite.inviteCode)}
            </Text>
            <Muted>
              Бариста сканує QR або вводить код у власному застосунку.
              Запрошення діє до {timeOf(invite.inviteExpiresAt)}, впускає одну
              людину; зміна — до {timeOf(invite.grantExpiresAt)}.
            </Muted>
            <Button
              title="Запросити ще"
              variant="secondary"
              disabled={busy}
              onPress={() => void mintInvite()}
            />
          </>
        ) : (
          <>
            <Muted>
              Відкрийте зміну — бариста скануватиме клієнтів зі свого акаунта,
              не торкаючись вашого. Зміна закінчиться сама наприкінці дня.
            </Muted>
            <Button
              title="Відкрити зміну"
              disabled={busy}
              onPress={() => void mintInvite()}
            />
            <Button
              title="Пробна зміна на 2 години"
              variant="secondary"
              disabled={busy}
              onPress={() => void mintInvite(TRIAL_SHIFT_MINUTES)}
            />
          </>
        )}

        <Title>На зміні</Title>
        {shifts === null ? (
          <ActivityIndicator color={colors.brand} />
        ) : shifts.length === 0 ? (
          <Muted>{"Наразі нікого — прийняте запрошення з'явиться тут."}</Muted>
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
  qrFrame: {
    width: QR_SIZE,
    height: QR_SIZE,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteCode: {
    fontSize: 24,
    fontVariant: ["tabular-nums"],
    letterSpacing: 3,
    fontWeight: "600",
    color: colors.brand,
    textAlign: "center",
  },
  shiftRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
});
