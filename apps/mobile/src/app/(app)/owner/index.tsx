import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { Muted, OwnerBadge, Title } from "@/components/text";
import { useMe } from "@/features/account/me-context";
import { colors, radius } from "@/theme/colors";

/** CafeOwner Mode landing: the owner's Cafés, each opening its loyalty-program editor. */
export default function OwnerHome() {
  const { me } = useMe();
  const cafes = me?.cafes ?? [];

  return (
    <Screen>
      <Card>
        <OwnerBadge>Режим Кавовара</OwnerBadge>
        {cafes.map((cafe) => (
          <Pressable
            key={cafe.id}
            style={styles.cafeRow}
            onPress={() => router.push({ pathname: "/owner/[cafeId]", params: { cafeId: cafe.id } })}
          >
            <Title>{cafe.name}</Title>
            <Muted>Налаштувати програму ›</Muted>
          </Pressable>
        ))}
        <Muted>Сканування QR з&apos;явиться у наступному оновленні.</Muted>
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
    borderColor: colors.border,
    borderRadius: radius,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 2,
  },
});
