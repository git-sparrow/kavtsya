import { qrTokenResponseSchema } from "@kavtsya/shared";
import { expect, it, vi } from "vitest";

// auth-client.ts pulls the whole Expo/React Native surface at import time;
// none of it matters for what apiFetch does to a response body.
vi.mock("expo-secure-store", () => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: {} } }));
vi.mock("expo-linking", () => ({
  createURL: vi.fn(() => "kavtsya://"),
  getInitialURL: vi.fn().mockResolvedValue(null),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
}));

// Better Auth captures the global fetch when the client is created, so the
// stub must be in place before auth-client.ts is imported.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const { apiFetch } = await import("../src/lib/auth-client");

/**
 * #85: Better Auth's client revives ISO date strings into Date objects before
 * Zod sees them, so any shared schema with a date field (e.g. `expiresAt:
 * z.string().datetime()`) rejects on device. Our API's wire format is strings;
 * apiFetch must hand them to the schemas untouched.
 */
it("hands date fields to the shared schemas as strings, not revived Dates (#85)", async () => {
  const body = { token: "qr-token-1", expiresAt: "2026-07-10T12:00:00.000Z" };
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  const { data, error } = await apiFetch("/api/qr-token");

  expect(error).toBeNull();
  expect(qrTokenResponseSchema.parse(data)).toEqual(body);
});
