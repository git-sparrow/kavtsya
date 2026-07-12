import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { RewardChip } from "@/components/reward-chip";
import { Screen } from "@/components/screen";
import { ErrorText, Muted, OwnerBadge } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useMe } from "@/features/account/me-context";
import { useProgramEditor } from "@/features/loyalty/use-program-editor";
import { theme } from "@/theme";

/**
 * Loyalty program config for one Café (#18): the CafeOwner sets the Зернятко
 * threshold and picks a Reward from the platform-default set.
 */
export default function CafeProgram() {
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafeName = me?.cafes.find((cafe) => cafe.id === cafeId)?.name ?? "";
  const editor = useProgramEditor(cafeId);

  if (editor.loading) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={theme.c.foreground} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <OwnerBadge>{cafeName}</OwnerBadge>

        <Muted>Поріг Зернятка (скільки до винагороди):</Muted>
        <TextField
          keyboardType="number-pad"
          value={editor.threshold}
          onChangeText={editor.editThreshold}
        />

        <Muted>Винагорода:</Muted>
        <RewardChip
          label="Без винагороди"
          active={editor.rewardType === null}
          onPress={() => editor.selectReward(null)}
        />
        {editor.defaults.map((d) => (
          <RewardChip
            key={d.type}
            label={d.label}
            active={editor.rewardType === d.type}
            onPress={() => editor.selectReward(d.type)}
          />
        ))}

        {editor.paramSpec && (
          <TextField
            placeholder={editor.paramSpec.placeholder}
            keyboardType={editor.paramSpec.numeric ? "number-pad" : "default"}
            value={editor.param}
            onChangeText={editor.editParam}
          />
        )}

        {editor.error && <ErrorText>{editor.error}</ErrorText>}
        {editor.saved && <Muted>Збережено ✓</Muted>}

        <Button title="Зберегти" onPress={editor.save} busy={editor.saving} />
        <Button
          title="Назад"
          variant="secondary"
          onPress={() => router.back()}
        />
      </Card>
    </Screen>
  );
}
