import { useState } from "react";
import { Pressable, Text } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText } from "@/components/text";
import { TextField } from "@/components/text-field";
import { authClient } from "@/lib/auth-client";
import { fontFamily, useTheme } from "@/theme";

type Mode = "signin" | "signup";

export default function SignIn() {
  // Read the live theme, not the static light snapshot: the remembered ВИГЛЯД
  // choice (#162) is already applied here, before anyone has signed in.
  const t = useTheme();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function submit() {
    setError(null);
    setBusy(true);
    const result = isSignup
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password });
    setBusy(false);
    // On success useSession picks up the new session and the root layout swaps
    // this screen for the authenticated home.
    if (result.error) {
      setError(result.error.message ?? "Не вдалося увійти");
    }
  }

  return (
    <Screen>
      <Card>
        {isSignup && (
          <TextField
            testID="sign-in.name"
            placeholder="Ім'я"
            autoCapitalize="words"
            value={name}
            onChangeText={setName}
          />
        )}
        <TextField
          testID="sign-in.email"
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextField
          testID="sign-in.password"
          placeholder="Пароль"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error && <ErrorText testID="sign-in.error">{error}</ErrorText>}

        <Button
          testID="sign-in.submit"
          title={isSignup ? "Зареєструватися" : "Увійти"}
          onPress={submit}
          busy={busy}
        />

        <Pressable
          testID="sign-in.toggle-mode"
          accessibilityRole="button"
          onPress={() => {
            setError(null);
            setMode(isSignup ? "signin" : "signup");
          }}
        >
          <Text
            style={{
              color: t.c.link,
              fontSize: t.font.size.sm,
              fontFamily: fontFamily.body.medium,
              textAlign: "center",
              marginTop: 4,
            }}
          >
            {isSignup
              ? "Вже маєте акаунт? Увійти"
              : "Немає акаунта? Зареєструватися"}
          </Text>
        </Pressable>
      </Card>
    </Screen>
  );
}
