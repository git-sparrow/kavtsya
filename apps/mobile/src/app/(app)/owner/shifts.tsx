import type { ShiftGrant, ShiftsResponse } from "@kavtsya/shared";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RoleHeader } from "@/components/role-header";
import { Screen } from "@/components/screen";
import {
  CountPill,
  ShiftDot,
  staffMeta,
  staffName,
} from "@/components/staff-list";
import { StatusStrip } from "@/components/status-strip";
import { Surface } from "@/components/surface";
import { Muted, SectionLabel } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import {
  endShiftConfirm,
  scansLabel,
  shiftClock,
} from "@/features/staff/staff-copy";
import { fetchShifts, revokeShift } from "@/lib/api";
import { fontFamily, useTheme } from "@/theme";

/**
 * The owner's «Зміна» board (#98/#99, ADR 0013; redesign turn 5c): who is behind
 * the counter right now — with when they started and how many Зернятка they've
 * issued this shift — and one tap to end a shift early, plus the shifts that
 * already closed today. Shifts START from the barista scanning the wall poster
 * (the code lives on the Roster board), so the owner never begins one; this
 * screen is watch-and-end only. The lists self-refresh on focus — no manual
 * refresh button — and a forgotten shift closes itself at the rolling safety cap.
 * Renders in the theme chosen in Settings → ВИГЛЯД (5c light / 5i dark).
 */
export default function OwnerShifts() {
  const t = useTheme();
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafeName = me?.cafes.find((cafe) => cafe.id === cafeId)?.name ?? "";

  const [board, setBoard] = useState<ShiftsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The shift awaiting the owner's confirmation to end (6d) — ending it closes
  // the scanner on the barista's device mid-service, so it is never a one-tap action.
  const [ending, setEnding] = useState<ShiftGrant | null>(null);

  const reload = useCallback(async () => {
    try {
      setBoard(await fetchShifts(cafeId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити зміни");
    }
  }, [cafeId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function endShift(grantId: string) {
    setBusy(true);
    try {
      await revokeShift(cafeId, grantId);
      setError(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завершити зміну");
    } finally {
      setBusy(false);
      setEnding(null);
    }
  }

  const header = (
    <RoleHeader
      kicker="Зміни"
      title={cafeName}
      action={{
        icon: "chevron-left",
        label: "Назад",
        testID: "shifts.back",
        onPress: () => router.back(),
      }}
    />
  );

  if (board === null) {
    return (
      <Screen header={header}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator size="large" color={t.c.foreground} />
        </View>
        {error && <StatusStrip intent="danger" title={error} />}
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <Muted style={{ textAlign: "left" }}>
        Бариста починають зміну самі — сканують постер кав&apos;ярні зі свого
        застосунку. Код постера — у «Ростері бариста».
      </Muted>

      {/* On shift now. */}
      <View style={{ gap: t.space[3] }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: t.space[2],
          }}
        >
          <SectionLabel>На зміні</SectionLabel>
          {board.active.length > 0 && (
            <CountPill count={board.active.length} tint="success" />
          )}
        </View>

        {board.active.length === 0 ? (
          <Muted style={{ textAlign: "left" }}>
            {"Наразі нікого — бариста з'явиться тут, щойно відкриє зміну."}
          </Muted>
        ) : (
          board.active.map((shift) => (
            <Surface key={shift.id}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: t.space[3],
                }}
              >
                <Avatar name={shift.baristaName} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={staffName(t)}>{shift.baristaName}</Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <ShiftDot />
                    <Text
                      style={[
                        staffMeta(t),
                        {
                          color: t.c.success,
                          fontFamily: fontFamily.body.semibold,
                        },
                      ]}
                    >
                      з {shiftClock(shift.startedAt)}
                    </Text>
                  </View>
                  <Text style={staffMeta(t)}>
                    {scansLabel(shift.scanCount)}
                  </Text>
                </View>
                <Button
                  title="Завершити"
                  variant="secondary"
                  testID={`shifts.active.${shift.id}.end`}
                  disabled={busy}
                  onPress={() => setEnding(shift)}
                />
              </View>
            </Surface>
          ))
        )}
      </View>

      {/* Closed today. */}
      {board.completedToday.length > 0 && (
        <View style={{ gap: t.space[3] }}>
          <SectionLabel>Завершені сьогодні</SectionLabel>
          <Surface style={{ padding: 0, gap: 0 }}>
            {board.completedToday.map((shift, i) => (
              <View key={`${shift.baristaName}-${shift.endedAt}-${i}`}>
                {i > 0 ? (
                  <View style={{ height: 1, backgroundColor: t.c.border }} />
                ) : null}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: t.space[3],
                    paddingVertical: t.space[3],
                    paddingHorizontal: t.space[5],
                  }}
                >
                  <Avatar name={shift.baristaName} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={staffName(t)}>{shift.baristaName}</Text>
                    <Text style={staffMeta(t)}>
                      {shiftClock(shift.startedAt)}–{shiftClock(shift.endedAt)}{" "}
                      · {scansLabel(shift.scanCount)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </Surface>
        </View>
      )}

      {error && <StatusStrip intent="danger" title={error} />}

      <View style={{ flex: 1 }} />
      <Muted>Зміна закривається сама після ліміту безпеки</Muted>

      {/* 6d: the same anatomy as 6c — who, the shift's facts, and the effect the
          barista feels immediately (ADR 0013: the owner may end a shift). */}
      {ending ? (
        <ConfirmDialog
          testID="shifts.end-dialog"
          chip={{ avatar: ending.baristaName }}
          {...endShiftConfirm(ending)}
          busy={busy}
          onConfirm={() => void endShift(ending.id)}
          onCancel={() => setEnding(null)}
        />
      ) : null}
    </Screen>
  );
}
