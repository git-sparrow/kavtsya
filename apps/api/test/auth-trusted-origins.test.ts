import { Pool } from "pg";
import { afterEach, describe, expect, test, vi } from "vitest";
import { assertProductionOrigins, createAuth } from "../src/auth";

function authFor(production: boolean) {
  return createAuth({
    database: new Pool(), // never queried: origin checks need no database
    secret: "test-secret-at-least-32-characters-long",
    baseURL: "https://api.kavtsya.com",
    production,
  });
}

async function trusts(production: boolean, url: string): Promise<boolean> {
  return (await authFor(production).$context).isTrustedOrigin(url);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test("production trusts the app scheme", async () => {
  expect(await trusts(true, "kavtsya://")).toBe(true);
});

test("production trusts no Expo Go origin, whatever host it names", async () => {
  expect(await trusts(true, "exp://attacker.example:8081/--/")).toBe(false);
});

test("outside production, Expo Go stays trusted for local development", async () => {
  expect(await trusts(false, "exp://192.168.1.5:8081")).toBe(true);
});

test.each([true, false])(
  "a foreign web origin is never trusted (production: %s)",
  async (production) => {
    expect(await trusts(production, "https://attacker.example")).toBe(false);
  },
);

describe("assertProductionOrigins", () => {
  test("accepts the production defaults", async () => {
    await expect(assertProductionOrigins(authFor(true))).resolves.toBe(
      undefined,
    );
  });

  // Better Auth matches case-insensitively and expands wildcards, so each of
  // these trusts exp://attacker.example — as does any origin we didn't intend.
  test.each(["exp://", "EXP://", "exp:", "*", "https://attacker.example"])(
    "refuses an extra origin added through the environment: %s",
    async (origin) => {
      vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", origin);
      await expect(assertProductionOrigins(authFor(true))).rejects.toThrow(
        "Production trusts unexpected origins",
      );
    },
  );
});
