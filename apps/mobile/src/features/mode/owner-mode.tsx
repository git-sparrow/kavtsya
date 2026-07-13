import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { OwnerBadge, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/theme";

/**
 * CafeOwner Mode (#96, ADR 0015): the owner's default landing — their Cafés and
 * the operator controls for each (scan a Customer, tune the program, run a
 * «Зміна», send a Розсилка). Owner-primary: reaching their own Customer Mode is
 * a Settings excursion, not a button here, so the operator surface stays
 * focused on running the café.
 */
export function OwnerMode() {
  const t = useTheme();
  const { me } = useMe();
  const cafes = me?.cafes ?? [];

  return (
    <Screen>
      <Card>
        <OwnerBadge>Режим Кавовара</OwnerBadge>
        {cafes.map((cafe) => (
          <View
            key={cafe.id}
            style={[
              styles.cafeRow,
              { borderColor: t.c.border, borderRadius: t.radius.md },
            ]}
          >
            <Title>{cafe.name}</Title>
            <Button
              title="Сканувати QR клієнта"
              onPress={() =>
                router.push({
                  pathname: "/owner/scan",
                  params: { cafeId: cafe.id },
                })
              }
            />
            <Button
              title="Налаштувати програму"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/owner/[cafeId]",
                  params: { cafeId: cafe.id },
                })
              }
            />
            <Button
              title="Зміна"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/owner/shifts",
                  params: { cafeId: cafe.id },
                })
              }
            />
            <Button
              title="Розсилка"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/owner/campaigns",
                  params: { cafeId: cafe.id },
                })
              }
            />
          </View>
        ))}
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
  cafeRow: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
});
