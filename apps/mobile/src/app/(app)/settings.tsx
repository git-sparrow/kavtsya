import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, OwnerBadge, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { registerDeviceForPush } from "@/features/push/push-registration";
import { updatePushConsent } from "@/lib/api";
import { theme } from "@/theme";

/**
 * Settings (#24): today just the café-news toggle — opting out at any time is
 * part of the consent deal (one annoying campaign must not cost an uninstall).
 * The server checks consent at every send, so flipping this off is
 * immediately effective, whatever tokens exist.
 */
export default function Settings() {
  const { me, reload } = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await updatePushConsent(next);
      await reload();
      // Fire-and-forget, AFTER the UI state settled: the token fetch can hang
      // where push isn't supported (Expo Go) and must never freeze the switch.
      if (next) void registerDeviceForPush();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти вибір");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <OwnerBadge>Налаштування</OwnerBadge>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Title style={styles.rowTitle}>Новини від кав&apos;ярень</Title>
            <Muted style={styles.rowHint}>
              Push-повідомлення лише від кав&apos;ярень, де ви буваєте
            </Muted>
          </View>
          <Switch
            value={me?.pushConsent ?? false}
            disabled={busy || !me}
            onValueChange={(next) => void toggle(next)}
            trackColor={{ true: theme.c.primary, false: theme.c.border }}
          />
        </View>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    textAlign: "left",
  },
  rowHint: {
    textAlign: "left",
  },
});
