import { DEVICE_ID_HEADER } from "@kavtsya/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { cleanup, renderHook, waitFor } from "./support/render-hook";

/**
 * Driven through the real Better Auth client and its Expo plugin, with only the
 * server and the native modules stubbed, so the test pins how the installed
 * library reports each outcome.
 */

const store = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) =>
    void store.set(key, value),
  deleteItemAsync: async (key: string) => void store.delete(key),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  NativeModules: { SourceCode: { getConstants: () => ({}) } },
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: {} } }));
vi.mock("expo-linking", () => ({
  createURL: vi.fn(() => "kavtsya://"),
  getInitialURL: vi.fn().mockResolvedValue(null),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
}));
vi.mock("expo-notifications", () => ({}));

const HOUR = 60 * 60 * 1000;
const sessionOf = (userId: string, expiresAt = Date.now() + HOUR) => ({
  session: {
    id: `session-${userId}`,
    userId,
    token: `token-${userId}`,
    expiresAt: new Date(expiresAt).toISOString(),
  },
  user: { id: userId, email: `${userId}@example.com`, name: userId },
});

type GetSessionReply =
  | { kind: "session"; userId: string }
  | { kind: "none" }
  | { kind: "unauthorized" }
  | { kind: "offline" };
let server: GetSessionReply = { kind: "offline" };
let signOutReachesServer = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const fetchMock = vi.fn(
  async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/sign-out")) {
      if (!signOutReachesServer) throw new TypeError("Network request failed");
      return json({ success: true });
    }
    if (!url.includes("/get-session")) throw new Error(`unexpected ${url}`);
    switch (server.kind) {
      case "session":
        return json(sessionOf(server.userId));
      case "none":
        return json(null);
      case "unauthorized":
        return json({ message: "Unauthorized" }, 401);
      case "offline":
        throw new TypeError("Network request failed");
    }
  },
);
vi.stubGlobal("fetch", fetchMock);

async function freshLaunch() {
  vi.resetModules();
  const { authClient } = await import("../src/lib/auth-client");
  const { useSessionForgettingEndedAccounts } =
    await import("../src/features/account/session");
  const { signOut } = await import("../src/features/account/sign-out");
  const hook = renderHook(useSessionForgettingEndedAccounts);
  const checkSession = () => authClient.$store.atoms.session.get().refetch();
  await checkSession();
  return { hook, checkSession, signOut };
}

const appSecureStoreEntries = () =>
  Object.fromEntries([...store].filter(([key]) => key.startsWith("kavtsya.")));

const accountData = (userId: string) => ({
  [`kavtsya.member_code.${userId}`]: "K7-1234",
  [`kavtsya.push_consent_decided.${userId}`]: "yes",
  "kavtsya.device_id": "device-1",
});

async function signedInAs(userId: string) {
  server = { kind: "session", userId };
  const app = await freshLaunch();
  await waitFor(() =>
    expect(store.get("kavtsya.account_on_device")).toBe(userId),
  );
  for (const [key, value] of Object.entries(accountData(userId)))
    store.set(key, value);
  return app;
}

beforeEach(() => {
  store.clear();
  fetchMock.mockClear();
  signOutReachesServer = true;
});
afterEach(cleanup);

it("forgets the account when the server revokes its session", async () => {
  const { hook, checkSession } = await signedInAs("user-a");

  server = { kind: "none" };
  await checkSession();

  expect(hook.result.current).toEqual({ kind: "ended" });
  await waitFor(() => expect(appSecureStoreEntries()).toEqual({}));
});

it("forgets the account when the server answers 401", async () => {
  const { checkSession } = await signedInAs("user-a");

  server = { kind: "unauthorized" };
  await checkSession();

  await waitFor(() => expect(appSecureStoreEntries()).toEqual({}));
});

it("forgets the account whose session expired while the app was closed", async () => {
  await signedInAs("user-a");
  cleanup();
  store.set(
    "kavtsya_session_data",
    JSON.stringify(sessionOf("user-a", Date.now() - HOUR)),
  );

  server = { kind: "none" };
  const { hook } = await freshLaunch();

  expect(hook.result.current).toEqual({ kind: "ended" });
  await waitFor(() => expect(appSecureStoreEntries()).toEqual({}));
});

it("keeps the account through a session check that fails on the network", async () => {
  const { hook, checkSession } = await signedInAs("user-a");

  server = { kind: "offline" };
  await checkSession();

  expect(hook.result.current).toEqual({ kind: "signedIn", userId: "user-a" });
  expect(appSecureStoreEntries()).toMatchObject(accountData("user-a"));
});

it("keeps the account and stays signed in on an offline launch", async () => {
  await signedInAs("user-a");
  cleanup();

  server = { kind: "offline" };
  const { hook } = await freshLaunch();

  expect(hook.result.current).toEqual({ kind: "signedIn", userId: "user-a" });
  expect(appSecureStoreEntries()).toMatchObject(accountData("user-a"));
});

it("keeps the account on an offline launch after its session expired", async () => {
  await signedInAs("user-a");
  cleanup();
  store.set(
    "kavtsya_session_data",
    JSON.stringify(sessionOf("user-a", Date.now() - HOUR)),
  );

  server = { kind: "offline" };
  const { hook } = await freshLaunch();

  expect(hook.result.current).toEqual({ kind: "unreachable" });
  expect(appSecureStoreEntries()).toMatchObject(accountData("user-a"));
});

it("names the device to the server on sign-out, then forgets the account", async () => {
  const { hook, signOut } = await signedInAs("user-a");

  await signOut();

  const signOutRequest = fetchMock.mock.calls.find(([input]) =>
    String(input).endsWith("/sign-out"),
  );
  expect(new Headers(signOutRequest?.[1]?.headers).get(DEVICE_ID_HEADER)).toBe(
    "device-1",
  );
  expect(hook.result.current).toEqual({ kind: "ended" });
  await waitFor(() => expect(appSecureStoreEntries()).toEqual({}));
});

it("forgets the account on sign-out even when the request fails", async () => {
  const { hook, signOut } = await signedInAs("user-a");

  signOutReachesServer = false;
  await signOut();

  expect(hook.result.current).toEqual({ kind: "ended" });
  await waitFor(() => expect(appSecureStoreEntries()).toEqual({}));
});

it("forgets the account its session ended for when another account signs in", async () => {
  const { checkSession } = await signedInAs("user-a");
  store.set("kavtsya.member_code.user-b", "K7-5678");
  store.set("kavtsya.theme_preference", "dark");

  server = { kind: "session", userId: "user-b" };
  await checkSession();

  await waitFor(() =>
    expect(appSecureStoreEntries()).toEqual({
      "kavtsya.account_on_device": "user-b",
      "kavtsya.member_code.user-b": "K7-5678",
      "kavtsya.theme_preference": "dark",
    }),
  );
});
