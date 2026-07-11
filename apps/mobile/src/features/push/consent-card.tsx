import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Muted, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { useBalances } from "@/features/loyalty/use-balances";
import { registerDeviceForPush } from "@/features/push/push-registration";
import { updatePushConsent } from "@/lib/api";
import { colors, radius } from "@/theme/colors";

/**
 * Whether THIS account already answered the consent question on this device —
 * keyed per account (the #91 lesson), so a shared phone never inherits the
 * previous user's "already asked".
 */
function decidedKeyFor(userId: string): string {
  return `kavtsya.push_consent_decided.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/**
 * The café-news consent prompt (#24): asked at the moment of demonstrated
 * value — after the Customer's FIRST earned Зернятко — never at first app
 * open. Renders nothing until that moment, and never again once answered
 * (either way); the settings toggle is where minds change later.
 */
export function ConsentCard() {
  const { me, reload } = useMe();
  const { balances } = useBalances();
  const userId = me?.id;
  const [decided, setDecided] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void SecureStore.getItemAsync(decidedKeyFor(userId)).then((stored) => {
      if (active) setDecided(stored !== null);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const hasEarned = (balances?.length ?? 0) > 0;
  // Consent set elsewhere (another device) counts as decided too.
  if (!me || !userId || !hasEarned || decided !== false || me.pushConsent) {
    return null;
  }

  async function answer(consent: boolean) {
    setBusy(true);
    try {
      await updatePushConsent(consent);
      await SecureStore.setItemAsync(
        decidedKeyFor(userId!),
        consent ? "yes" : "no",
      );
      setDecided(true);
      await reload();
      // Fire-and-forget, AFTER the UI state settled: the token fetch can hang
      // where push isn't supported (Expo Go) and must never strand the screen.
      if (consent) void registerDeviceForPush();
    } catch {
      // Couldn't save — leave the card up; the next tap retries.
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Title>Перше зернятко! 🌱</Title>
      <Muted>
        Хочете новини і подарунки від ваших кав&apos;ярень? Лише від тих, де ви
        буваєте — і це завжди можна вимкнути в налаштуваннях.
      </Muted>
      <Button
        title="Хочу новини й подарунки"
        disabled={busy}
        onPress={() => void answer(true)}
      />
      <Button
        title="Ні, дякую"
        variant="secondary"
        disabled={busy}
        onPress={() => void answer(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
});
