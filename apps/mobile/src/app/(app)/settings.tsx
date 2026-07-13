import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import {
  ErrorText,
  Muted,
  OwnerBadge,
  SectionLabel,
  Title,
} from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { RegisterCafeForm } from "@/features/cafe/register-cafe-form";
import { useMode } from "@/features/mode/mode-context";
import { registerDeviceForPush } from "@/features/push/push-registration";
import { updatePushConsent } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/theme";

/**
 * Settings (#96, ADR 0015): the excursion drawer where role transitions live,
 * so the Mode surfaces themselves stay uncluttered. Holds the #24 café-news
 * toggle, café registration (a Customer becoming an owner → drops into CafeOwner
 * Mode), and the non-persisted Mode switch (an owner stepping into their own
 * Customer Mode and back). Joining a «Зміна» lives here transitionally until the
 * café-poster path replaces it (#97/#98).
 */
export default function Settings() {
  const t = useTheme();
  const { me, reload } = useMe();
  const { mode, switchTo, clearExcursion } = useMode();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = me?.roles.includes("cafe_owner") ?? false;

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
            <Title style={styles.left}>Новини від кав&apos;ярень</Title>
            <Muted style={styles.left}>
              Push-повідомлення лише від кав&apos;ярень, де ви буваєте
            </Muted>
          </View>
          <Switch
            value={me?.pushConsent ?? false}
            disabled={busy || !me}
            onValueChange={(next) => void toggle(next)}
            trackColor={{ true: t.c.primary, false: t.c.border }}
          />
        </View>
        {error && <ErrorText>{error}</ErrorText>}

        {/* Role transitions. Owner-primary means the switch is an owner's way
            into their own Customer Mode and back — never persisted. */}
        <SectionLabel style={styles.sectionLabel}>Ролі</SectionLabel>
        {isOwner ? (
          mode === "owner" ? (
            <Button
              title="Перейти в режим клієнта"
              variant="secondary"
              onPress={() => {
                switchTo("customer");
                router.back();
              }}
            />
          ) : (
            <Button
              title="Повернутися в режим Кавовара"
              variant="secondary"
              onPress={() => {
                clearExcursion();
                router.back();
              }}
            />
          )
        ) : (
          <RegisterCafeForm
            onRegistered={async () => {
              await reload();
              // A fresh owner lands in CafeOwner Mode — drop any excursion and
              // let the dispatcher re-derive.
              clearExcursion();
              router.back();
            }}
          />
        )}

        {/* Transitional (#96): a barista joins a «Зміна» from here until the
            café-poster path (#97/#98) becomes the way in. */}
        <Button
          title="Долучитися до зміни"
          variant="secondary"
          onPress={() => router.push("/shift/join")}
        />

        {/* Account. Sign-out lives here (ADR 0015): every role reaches it the
            one way, through the gear — and the Scanner kiosk cannot. */}
        <SectionLabel style={styles.sectionLabel}>Акаунт</SectionLabel>
        <Button
          title="Вийти"
          variant="secondary"
          onPress={() => authClient.signOut()}
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
  left: {
    textAlign: "left",
  },
  sectionLabel: {
    marginTop: 4,
  },
});
