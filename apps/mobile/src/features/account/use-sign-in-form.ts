import { useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";

type Mode = "signin" | "signup";

/**
 * The sign-in screen's form: fields, mode, and the one `submit` that both the
 * button and Return on the password field call (#441).
 */
export function useSignInForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // `busy` lags a render behind; two Returns in one frame both see it false.
  const inFlight = useRef(false);

  const isSignup = mode === "signup";

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      const result = isSignup
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
      // On success useSession picks up the new session and the root layout
      // swaps the screen for the authenticated home.
      if (result.error) {
        setError(result.error.message ?? "Не вдалося увійти");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function toggleMode() {
    setError(null);
    setMode(isSignup ? "signin" : "signup");
  }

  return {
    isSignup,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    error,
    busy,
    submit,
    toggleMode,
  };
}
