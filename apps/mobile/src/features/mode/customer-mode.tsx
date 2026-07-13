import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { Surface } from "@/components/surface";
import { Heading, Muted, SectionLabel, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { CafeBalances } from "@/features/loyalty/cafe-balances";
import { CustomerQr } from "@/features/loyalty/customer-qr";
import { ConsentCard } from "@/features/push/consent-card";
import { registerDeviceForPush } from "@/features/push/push-registration";
import { authClient } from "@/lib/auth-client";

/**
 * Customer Mode (#96, ADR 0015): the clean identity surface for a plain
 * Customer — their QR/member code, their Зернятка balances, the #24 consent
 * moment, and the way into Settings. Nothing role-specific ever appears here:
 * becoming an owner or a barista lives in Settings, so this screen never
 * accretes another role's clutter.
 */
export function CustomerMode() {
  const { me } = useMe();

  // Token upkeep (#24): a consenting account refreshes this device's push token
  // on arrival, so a rotated token re-homes itself without user action.
  const consentsToPush = me?.pushConsent ?? false;
  useEffect(() => {
    if (consentsToPush) void registerDeviceForPush();
  }, [consentsToPush]);

  return (
    <Screen>
      <Card>
        <View style={styles.greeting}>
          <Heading>Вітаємо, {me?.name || me?.email}!</Heading>
          <Muted style={styles.email}>{me?.email}</Muted>
        </View>

        <Surface style={styles.qrCard}>
          <Title>Твій код учасника</Title>
          <CustomerQr />
        </Surface>

        {/* The café-news moment (#24): asked once, after the first Зернятко. */}
        <ConsentCard />

        <SectionLabel style={styles.sectionLabel}>
          Мої кав&apos;ярні
        </SectionLabel>
        <CafeBalances />

        <Button
          title="Налаштування"
          variant="secondary"
          onPress={() => router.push("/settings")}
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

const styles = StyleSheet.create({
  greeting: {
    alignSelf: "stretch",
    gap: 2,
  },
  email: {
    textAlign: "left",
  },
  qrCard: {
    alignItems: "center",
  },
  sectionLabel: {
    marginTop: 4,
  },
});
