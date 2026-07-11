import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { RegisterCafeForm } from "@/features/cafe/register-cafe-form";
import { CafeBalances } from "@/features/loyalty/cafe-balances";
import { CustomerQr } from "@/features/loyalty/customer-qr";
import { ConsentCard } from "@/features/push/consent-card";
import { registerDeviceForPush } from "@/features/push/push-registration";
import { useMyShift } from "@/features/shift/use-my-shift";
import { authClient } from "@/lib/auth-client";
import { colors } from "@/theme/colors";

/**
 * Customer home. A CafeOwner can switch into CafeOwner Mode (a view toggle, not
 * a separate account — ADR 0003); a plain Customer is offered café registration
 * to become one.
 */
export default function Home() {
  const { me, error, reload } = useMe();
  // The shift this account holds (#80): shows the scanner-mode entry while a
  // barista is on duty, and the join entry otherwise.
  const { shift } = useMyShift();

  // Token upkeep (#24): a consenting account refreshes this device's push
  // token on arrival — a rotated token re-homes itself without user action.
  const consentsToPush = me?.pushConsent ?? false;
  useEffect(() => {
    if (consentsToPush) void registerDeviceForPush();
  }, [consentsToPush]);

  if (error) {
    return (
      <Screen>
        <Card>
          <ErrorText>{error}</ErrorText>
          <Button
            title="Спробувати знову"
            variant="secondary"
            onPress={() => void reload()}
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

  if (!me) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={colors.brand} />
      </Screen>
    );
  }

  const isOwner = me.roles.includes("cafe_owner");

  return (
    <Screen>
      <Card>
        <Title>Вітаємо, {me.name || me.email}!</Title>
        <Muted>{me.email}</Muted>

        <CustomerQr />

        <CafeBalances />

        {/* The café-news moment (#24): asked once, after the first Зернятко. */}
        <ConsentCard />

        {isOwner ? (
          <Button
            title="Режим Кавовара"
            onPress={() => router.push("/owner")}
          />
        ) : (
          <RegisterCafeForm onRegistered={reload} />
        )}

        {/* «Зміна» (#80): a barista on duty jumps straight into scanner mode;
            anyone else can join one with the owner's invite. */}
        {shift ? (
          <Button
            title={`Зміна у «${shift.cafeName}» — сканувати`}
            onPress={() => router.push("/shift/scan")}
          />
        ) : (
          <Button
            title="Долучитися до зміни"
            variant="secondary"
            onPress={() => router.push("/shift/join")}
          />
        )}

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
