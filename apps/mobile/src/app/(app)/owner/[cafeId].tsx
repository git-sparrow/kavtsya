import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, useColorScheme, View } from "react-native";

import { BeanRow } from "@/components/bean-row";
import { Button } from "@/components/button";
import { RadioCard, RadioGroup } from "@/components/radio-card";
import { RoleHeader } from "@/components/role-header";
import { Screen } from "@/components/screen";
import { StatusStrip } from "@/components/status-strip";
import { Stepper } from "@/components/stepper";
import { Surface } from "@/components/surface";
import { Muted, Title } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useMe } from "@/features/account/me-context";
import { clampThreshold } from "@/features/loyalty/program";
import {
  buildReward,
  rewardLabel,
  rewardUnit,
} from "@/features/loyalty/reward";
import { useProgramEditor } from "@/features/loyalty/use-program-editor";
import { BEAN_FORMS, pluralizeUk } from "@/lib/plural";
import { fontFamily, ThemeProvider, useTheme } from "@/theme";

/**
 * Loyalty program config for one Café (#18, screens 3b/3e + 3c/3f): the
 * CafeOwner sets the Зернятко threshold with a ± stepper (previewed as the
 * bean row the Customer will see) and picks a Reward from the platform-default
 * set. Saving swaps the form for a dedicated confirmation. Follows the OS colour
 * scheme like the rest of the redesigned owner surface.
 */
export default function CafeProgram() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <ThemeProvider theme={scheme}>
      <CafeProgramBody />
    </ThemeProvider>
  );
}

function CafeProgramBody() {
  const t = useTheme();
  const { cafeId } = useLocalSearchParams<{ cafeId: string }>();
  const { me } = useMe();
  const cafeName = me?.cafes.find((cafe) => cafe.id === cafeId)?.name ?? "";
  const editor = useProgramEditor(cafeId);

  const header = (
    <RoleHeader
      kicker="Програма лояльності"
      title={cafeName}
      action={{
        icon: "chevron-left",
        label: "Назад",
        testID: "program-back",
        onPress: () => router.back(),
      }}
    />
  );

  if (editor.loading) {
    return (
      <Screen header={header}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator size="large" color={t.c.foreground} />
        </View>
      </Screen>
    );
  }

  // Saved (3c/3f): the confirmation IS the screen — the form is replaced.
  if (editor.saved) {
    const n = clampThreshold(Number(editor.threshold), 0);
    const beans = `${n} ${pluralizeUk(n, BEAN_FORMS)}`;
    let reward = "";
    try {
      reward = rewardLabel(buildReward(editor.rewardType, editor.param));
    } catch {
      reward = "";
    }
    return (
      <Screen header={header}>
        <StatusStrip
          testID="program-saved"
          intent="success"
          solid
          title="Збережено"
          detail="Клієнти вже бачать нові умови"
        />
        <Surface>
          <Text
            style={{
              fontSize: t.font.size.lg,
              fontFamily: fontFamily.body.bold,
              color: t.c.foreground,
            }}
          >
            {reward ? `${reward} · ${beans}` : beans}
          </Text>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              fontFamily: fontFamily.body.regular,
              color: t.c["text-secondary"],
            }}
          >
            Зміна порогу не переоцінює вже зароблені зернята — і не торкається
            минулих Винагород
          </Text>
        </Surface>
        <View style={{ flex: 1 }} />
        <Button
          title="Готово"
          testID="program-done"
          onPress={() => router.back()}
        />
      </Screen>
    );
  }

  const thresholdNum = clampThreshold(Number(editor.threshold), 0);

  return (
    <Screen header={header}>
      <Surface>
        {/* Hidden from assistive tech: the stepper below announces the same
            question as its adjustable label, so reading it twice is noise. */}
        <Title
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          Скільки зернят до Винагороди
        </Title>
        <Stepper
          testID="program-threshold"
          value={thresholdNum}
          label="Скільки зернят до Винагороди"
          onStep={editor.stepThreshold}
        />
        <View style={{ alignItems: "center", gap: t.space[2] }}>
          <BeanRow balance={0} threshold={thresholdNum} size="large" />
          <Muted>Так це побачить клієнт</Muted>
        </View>
      </Surface>

      <Text
        style={{
          fontSize: t.font.size.lg,
          fontFamily: fontFamily.body.bold,
          color: t.c.foreground,
        }}
      >
        Винагорода
      </Text>
      <RadioGroup label="Винагорода">
        <RadioCard
          testID="program-reward-none"
          label="Без винагороди"
          selected={editor.rewardType === null}
          onPress={() => editor.selectReward(null)}
        />
        {editor.defaults.map((d) => (
          <RadioCard
            key={d.type}
            testID={`program-reward-${d.type}`}
            label={d.label}
            trailing={rewardUnit(d.type)}
            selected={editor.rewardType === d.type}
            onPress={() => editor.selectReward(d.type)}
          />
        ))}
      </RadioGroup>

      {editor.paramSpec && (
        <View style={{ alignSelf: "stretch", gap: t.space[2] }}>
          <Muted style={{ textAlign: "left" }}>{editor.paramSpec.label}</Muted>
          <TextField
            testID="program-reward-param"
            placeholder={editor.paramSpec.placeholder}
            keyboardType={editor.paramSpec.numeric ? "number-pad" : "default"}
            value={editor.param}
            onChangeText={editor.editParam}
          />
        </View>
      )}

      {editor.error && (
        <StatusStrip
          testID="program-error"
          intent="danger"
          title={editor.error}
        />
      )}

      <View style={{ flex: 1 }} />
      <Button
        title="Зберегти"
        testID="program-save"
        onPress={editor.save}
        busy={editor.saving}
      />
    </Screen>
  );
}
