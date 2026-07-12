import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { OwnerBadge, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { theme } from "@/theme";

/** CafeOwner Mode landing: the owner's Cafés — scan a Customer QR (#20) or open the program editor. */
export default function OwnerHome() {
  const { me } = useMe();
  const cafes = me?.cafes ?? [];

  return (
    <Screen>
      <Card>
        <OwnerBadge>Режим Кавовара</OwnerBadge>
        {cafes.map((cafe) => (
          <View key={cafe.id} style={styles.cafeRow}>
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
          title="Повернутися в режим клієнта"
          variant="secondary"
          onPress={() => router.back()}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cafeRow: {
    borderWidth: 1,
    borderColor: theme.c.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[3],
    gap: theme.space[2],
  },
});
