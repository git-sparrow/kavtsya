import { useRef } from "react";
import { Pressable, Text, type TextInput } from "react-native";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Screen } from "@/components/screen";
import { ErrorText } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useSignInForm } from "@/features/account/use-sign-in-form";
import { fontFamily, useTheme } from "@/theme";

export { ScreenErrorBoundary as ErrorBoundary } from "@/components/render-error-fallback";

export default function SignIn() {
  // Read the live theme, not the static light snapshot: the remembered ВИГЛЯД
  // choice (#162) is already applied here, before anyone has signed in.
  const t = useTheme();
  const form = useSignInForm();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  return (
    <Screen>
      <Card>
        {form.isSignup && (
          <TextField
            testID="sign-in.name"
            placeholder="Ім'я"
            autoCapitalize="words"
            value={form.name}
            onChangeText={form.setName}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
        )}
        <TextField
          ref={emailRef}
          testID="sign-in.email"
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={form.email}
          onChangeText={form.setEmail}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          testID="sign-in.password"
          placeholder="Пароль"
          secureTextEntry
          value={form.password}
          onChangeText={form.setPassword}
          returnKeyType="go"
          onSubmitEditing={form.submit}
        />

        {form.error && (
          <ErrorText testID="sign-in.error">{form.error}</ErrorText>
        )}

        <Button
          testID="sign-in.submit"
          title={form.isSignup ? "Зареєструватися" : "Увійти"}
          onPress={form.submit}
          busy={form.busy}
        />

        <Pressable
          testID="sign-in.toggle-mode"
          accessibilityRole="button"
          onPress={form.toggleMode}
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
            {form.isSignup
              ? "Вже маєте акаунт? Увійти"
              : "Немає акаунта? Зареєструватися"}
          </Text>
        </Pressable>
      </Card>
    </Screen>
  );
}
