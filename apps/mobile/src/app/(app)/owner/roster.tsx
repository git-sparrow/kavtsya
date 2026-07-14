import type { RosterBoardResponse } from "@kavtsya/shared";
import { formatMemberCode } from "@kavtsya/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, OwnerBadge, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { approveBarista, fetchRoster, removeBarista } from "@/lib/api";
import { fontFamily, theme } from "@/theme";

/**
 * The CafeOwner's Barista Roster board (#97, ADR 0013): the wall-poster code to
 * print, the pending join requests to approve, and the rostered baristas to
 * remove. Security rests on this list, not the poster — approving is what turns
 * a scan into trust, and removing (next slice) ends a barista's access. Twice
 * per barista's lifetime is all the owner's effort: approve once, remove once.
 */
export default function OwnerRoster() {
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafeName = me?.cafes.find((cafe) => cafe.id === cafeId)?.name ?? "";

  const [board, setBoard] = useState<RosterBoardResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      setBoard(await fetchRoster(cafeId));
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не вдалося завантажити ростер",
      );
    }
  }

  useEffect(() => {
    let active = true;
    void fetchRoster(cafeId)
      .then((loaded) => {
        if (active) setBoard(loaded);
      })
      .catch((e: unknown) => {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Не вдалося завантажити ростер",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [cafeId]);

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

  return (
    <Screen>
      <Card>
        <OwnerBadge>Ростер бариста — {cafeName}</OwnerBadge>

        <Title>Код постера</Title>
        {board === null ? (
          <ActivityIndicator color={theme.c.foreground} />
        ) : (
          <>
            <Text selectable style={styles.posterCode}>
              {formatMemberCode(board.posterCode)}
            </Text>
            <Muted>
              Роздрукуйте цей код на постері біля каси. Бариста сканує його зі
              свого застосунку, щоб надіслати запит — доступ дає ваше
              підтвердження, не сам код.
            </Muted>

            <Title>Запити ({board.pending.length})</Title>
            {board.pending.length === 0 ? (
              <Muted>Нових запитів немає.</Muted>
            ) : (
              board.pending.map((request) => (
                <View key={request.userId} style={styles.row}>
                  <Title>{request.name}</Title>
                  <Button
                    title="Підтвердити"
                    disabled={busy}
                    onPress={() =>
                      void act(
                        () => approveBarista(cafeId, request.userId),
                        "Не вдалося підтвердити бариста",
                      )
                    }
                  />
                  <Button
                    title="Відхилити"
                    variant="secondary"
                    disabled={busy}
                    onPress={() =>
                      void act(
                        () => removeBarista(cafeId, request.userId),
                        "Не вдалося відхилити запит",
                      )
                    }
                  />
                </View>
              ))
            )}

            <Title>Бариста ({board.rostered.length})</Title>
            {board.rostered.length === 0 ? (
              <Muted>Ще нікого не додано.</Muted>
            ) : (
              board.rostered.map((barista) => (
                <View key={barista.userId} style={styles.row}>
                  <Title>{barista.name}</Title>
                  <Button
                    title="Видалити"
                    variant="secondary"
                    disabled={busy}
                    onPress={() =>
                      void act(
                        () => removeBarista(cafeId, barista.userId),
                        "Не вдалося видалити бариста",
                      )
                    }
                  />
                </View>
              ))
            )}
          </>
        )}

        <Button
          title="Оновити"
          variant="secondary"
          disabled={busy}
          onPress={() => void reload()}
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
  posterCode: {
    fontSize: 24,
    fontVariant: ["tabular-nums"],
    letterSpacing: 3,
    fontFamily: fontFamily.body.semibold,
    color: theme.c.foreground,
    textAlign: "center",
  },
  row: {
    borderWidth: 1,
    borderColor: theme.c.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[3],
    gap: theme.space[2],
  },
});
