import { Pool } from "pg";
import { afterEach, expect, test, vi } from "vitest";
import { createAuth } from "../src/auth";

// The Expo plugin appends the session cookie to redirects aimed at a trusted
// non-web origin, so a trusted origin is one that may receive a session.
async function trusts(nodeEnv: string, url: string): Promise<boolean> {
  vi.stubEnv("NODE_ENV", nodeEnv);
  const auth = createAuth({
    database: new Pool(), // never queried: origin checks need no database
    secret: "test-secret-at-least-32-characters-long",
    baseURL: "https://api.kavtsya.com",
  });
  return (await auth.$context).isTrustedOrigin(url);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test("production trusts the app scheme", async () => {
  expect(await trusts("production", "kavtsya://")).toBe(true);
});

test("production trusts no Expo Go origin, whatever host it names", async () => {
  expect(await trusts("production", "exp://attacker.example:8081/--/")).toBe(
    false,
  );
});

test("outside production, Expo Go stays trusted for local development", async () => {
  expect(await trusts("development", "exp://192.168.1.5:8081")).toBe(true);
});

test("no environment trusts a foreign web origin", async () => {
  expect(await trusts("production", "https://attacker.example")).toBe(false);
});
