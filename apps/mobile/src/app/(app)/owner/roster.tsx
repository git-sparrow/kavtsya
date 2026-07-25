import type { RosterBoardResponse, RosterMemberEntry } from "@kavtsya/shared";
import { formatMemberCode } from "@kavtsya/shared";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/icon";
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
import { removeFromRosterConfirm } from "@/features/shift/staff-copy";
import { approveBarista, fetchRoster, removeBarista } from "@/lib/api";
import { fontFamily, ThemeProvider, useTheme } from "@/theme";

/**
 * The CafeOwner's Barista Roster board (#97, ADR 0013; redesign turn 5b): the
 * wall-poster code to print, the loud ЗАПИТИ list to approve, and the rostered
 * baristas — each with a live «● на зміні» dot — to remove. Security rests on
 * this list, not the poster: approving is what turns a scan into trust, and
 * removing ends a barista's access. The board self-refreshes on focus and after
 * every action, so there is no manual refresh button. Follows the OS colour
 * scheme like the rest of the owner surface (5b light / 5h dark).
 */
export default function OwnerRoster() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <ThemeProvider theme={scheme}>
      <OwnerRosterBody />
    </ThemeProvider>
  );
}

/** «запит N хв тому» — how long a pending request has waited, in café language. */
function requestedAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "щойно";
  if (minutes < 60) return `запит ${minutes} хв тому`;
  const hours = Math.floor(minutes / 60);
  return `запит ${hours} год тому`;
}

function OwnerRosterBody() {
  const t = useTheme();
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafeName = me?.cafes.find((cafe) => cafe.id === cafeId)?.name ?? "";

  const [board, setBoard] = useState<RosterBoardResponse | null>(null);
  // The instant the board was loaded — the reference «N хв тому» is measured
  // against. Captured at load (not in render, which must stay pure) and
  // refreshed on every focus reload.
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The barista whose removal is awaiting confirmation (6c) — removal is only
  // reversible through a fresh poster request, so it is never a one-tap action.
  const [removing, setRemoving] = useState<RosterMemberEntry | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await fetchRoster(cafeId);
      setBoard(next);
      setLoadedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не вдалося завантажити ростер",
      );
    }
  }, [cafeId]);

  // Self-refresh: reload whenever the board comes into focus (no refresh button).
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function act(run: () => Promise<void>, fallback: string) {
    setBusy(true);
    try {
      await run();
      setError(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemoval(barista: RosterMemberEntry) {
    await act(
      () => removeBarista(cafeId, barista.userId),
      "Не вдалося видалити бариста",
    );
    setRemoving(null);
  }

  const header = (
    <RoleHeader
      kicker="Ростер бариста"
      title={cafeName}
      action={{
        icon: "chevron-left",
        label: "Назад",
        testID: "roster.back",
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
      {/* The poster code to print by the till. */}
      <Surface>
        <SectionLabel>Код постера</SectionLabel>
        <Text selectable testID="roster.poster-code" style={styleCode(t)}>
          {formatMemberCode(board.posterCode)}
        </Text>
        <Muted style={{ textAlign: "left" }}>
          Роздрукуй біля каси — бариста сканує його, щоб надіслати запит. Доступ
          дає твоє підтвердження, не сам код.
        </Muted>
      </Surface>

      {/* Requests — the loud, act-now section (#97). */}
      {board.pending.length > 0 && (
        <View style={{ gap: t.space[3] }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: t.space[2],
            }}
          >
            <SectionLabel>Запити</SectionLabel>
            <CountPill count={board.pending.length} tint="accent" />
          </View>
          {board.pending.map((request) => (
            <Surface key={request.userId} emphasis="reward">
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: t.space[3],
                }}
              >
                <Avatar name={request.name} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={staffName(t)}>{request.name}</Text>
                  <Text style={staffMeta(t)}>
                    {requestedAgo(request.requestedAt, loadedAt)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: t.space[3] }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Підтвердити"
                    testID={`roster.requests.${request.userId}.approve`}
                    disabled={busy}
                    onPress={() =>
                      void act(
                        () => approveBarista(cafeId, request.userId),
                        "Не вдалося підтвердити бариста",
                      )
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Відхилити"
                    variant="secondary"
                    testID={`roster.requests.${request.userId}.reject`}
                    disabled={busy}
                    onPress={() =>
                      void act(
                        () => removeBarista(cafeId, request.userId),
                        "Не вдалося відхилити запит",
                      )
                    }
                  />
                </View>
              </View>
            </Surface>
          ))}
        </View>
      )}

      {/* The rostered baristas — approved, removable, with a live on-shift dot. */}
      <View style={{ gap: t.space[3] }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: t.space[2],
          }}
        >
          <SectionLabel>Бариста · {board.rostered.length}</SectionLabel>
        </View>
        {board.rostered.length === 0 ? (
          <Muted style={{ textAlign: "left" }}>
            Ще нікого не додано. Підтверджені бариста з&apos;являться тут.
          </Muted>
        ) : (
          <Surface style={{ padding: 0, gap: 0 }}>
            {board.rostered.map((barista, i) => (
              <View key={barista.userId}>
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
                  <Avatar name={barista.name} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={staffName(t)}>{barista.name}</Text>
                    {barista.onShift ? (
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
                          на зміні
                        </Text>
                      </View>
                    ) : (
                      <Text style={staffMeta(t)}>не на зміні</Text>
                    )}
                  </View>
                  <Pressable
                    testID={`roster.baristas.${barista.userId}.remove`}
                    accessibilityRole="button"
                    accessibilityLabel={`Прибрати ${barista.name} з ростеру`}
                    hitSlop={8}
                    disabled={busy}
                    onPress={() => setRemoving(barista)}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Icon name="close" size={22} color={t.c["text-muted"]} />
                  </Pressable>
                </View>
              </View>
            ))}
          </Surface>
        )}
      </View>

      {error && <StatusStrip intent="danger" title={error} />}

      {/* 6c: the removal confirm — the avatar chip names who, the body names all
          the consequences, and «Прибрати» carries the verb. */}
      {removing ? (
        <ConfirmDialog
          visible
          testID="roster.remove-dialog"
          chip={{ avatar: removing.name }}
          {...removeFromRosterConfirm(removing)}
          cancelLabel="Скасувати"
          busy={busy}
          onConfirm={() => void confirmRemoval(removing)}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </Screen>
  );
}

function styleCode(t: ReturnType<typeof useTheme>) {
  return {
    fontSize: t.font.size["2xl"],
    fontVariant: ["tabular-nums" as const],
    letterSpacing: 2,
    fontFamily: fontFamily.body.bold,
    color: t.c.foreground,
  };
}
