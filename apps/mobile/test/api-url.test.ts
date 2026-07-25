import { expect, it, vi } from "vitest";

/**
 * `localhost` means the phone itself on a physical device, so an app that hard
 * codes it can never reach a dev API. auth-client derives the host from Metro
 * instead — these tests pin that resolution order down.
 *
 * API_URL is computed once at module load, so each case resets the module
 * registry and re-imports with different mocks.
 */
async function loadAuthClient(options: {
  hostUri?: string;
  envUrl?: string;
}): Promise<{ requestedUrl: () => string }> {
  vi.resetModules();

  // auth-client.ts pulls the whole Expo/React Native surface at import time;
  // none of it matters for how the base URL is resolved.
  vi.doMock("expo-secure-store", () => ({
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    getItemAsync: vi.fn().mockResolvedValue(null),
    setItemAsync: vi.fn().mockResolvedValue(undefined),
    deleteItemAsync: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock("react-native", () => ({
    Platform: { OS: "ios" },
    AppState: {
      currentState: "active",
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
  }));
  vi.doMock("expo-linking", () => ({
    createURL: vi.fn(() => "kavtsya://"),
    getInitialURL: vi.fn().mockResolvedValue(null),
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  }));
  vi.doMock("expo-constants", () => ({
    default: {
      expoConfig: options.hostUri ? { hostUri: options.hostUri } : {},
    },
  }));

  // An empty string is falsy, so it stands in for "not set" without depending
  // on whatever the developer happens to have exported in their shell.
  vi.stubEnv("EXPO_PUBLIC_API_URL", options.envUrl ?? "");

  // Better Auth captures the global fetch when the client is created, so the
  // stub must be in place before auth-client.ts is imported.
  const fetchMock = vi.fn().mockResolvedValue(
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const { apiFetch } = await import("../src/lib/auth-client");
  await apiFetch("/api/me");

  return {
    requestedUrl: () => String(fetchMock.mock.calls[0]?.[0] ?? ""),
  };
}

it("derives the API host from the Metro host, so a physical device works unconfigured", async () => {
  const { requestedUrl } = await loadAuthClient({
    hostUri: "192.168.0.32:8081",
  });

  // Metro's port (8081) must not leak through — the API listens on 3000.
  expect(requestedUrl()).toContain("http://192.168.0.32:3000");
});

it("falls back to localhost when Metro reports no host", async () => {
  const { requestedUrl } = await loadAuthClient({});

  expect(requestedUrl()).toContain("http://localhost:3000");
});

it("lets EXPO_PUBLIC_API_URL win, so a deployed build is not overridden", async () => {
  const { requestedUrl } = await loadAuthClient({
    hostUri: "192.168.0.32:8081",
    envUrl: "https://api.example.com",
  });

  expect(requestedUrl()).toContain("https://api.example.com");
  expect(requestedUrl()).not.toContain("192.168.0.32");
});
