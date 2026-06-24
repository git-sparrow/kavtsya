import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

// Same API base the health check uses (see .env.example). The Better Auth
// client appends /api/auth/* itself.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Better Auth client for the app. The Expo plugin stores the session in
 * SecureStore, so it survives app restarts (acceptance criterion), and uses the
 * `kavtsya://` scheme for native redirects (needed later for Google/Apple).
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "kavtsya",
      storagePrefix: "kavtsya",
      storage: SecureStore,
    }),
  ],
});
