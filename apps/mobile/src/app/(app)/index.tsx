import { router } from "expo-router";
import { ActivityIndicator } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { RegisterCafeForm } from "@/features/cafe/register-cafe-form";
import { authClient } from "@/lib/auth-client";
import { colors } from "@/theme/colors";

/**
 * Customer home. A CafeOwner can switch into CafeOwner Mode (a view toggle, not
 * a separate account — ADR 0003); a plain Customer is offered café registration
 * to become one.
 */
export default function Home() {
  const { me, error, reload } = useMe();

  if (error) {
    return (
      <Screen>
        <Card>
          <ErrorText>{error}</ErrorText>
          <Button title="Спробувати знову" variant="secondary" onPress={() => void reload()} />
          <Button title="Вийти" variant="secondary" onPress={() => authClient.signOut()} />
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

        {isOwner ? (
          <Button title="Режим Кавовара" onPress={() => router.push("/owner")} />
        ) : (
          <RegisterCafeForm onRegistered={reload} />
        )}

        <Button title="Вийти" variant="secondary" onPress={() => authClient.signOut()} />
      </Card>
    </Screen>
  );
}
