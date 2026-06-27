import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  cafeSchema,
  loyaltyProgramSchema,
  rewardDefaultsSchema,
} from "@kavtsya/shared";
import { createApp } from "../src/app";
import type { Auth } from "../src/auth";
import { systemClock } from "../src/clock";
import type { Database } from "../src/db";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

let db: Database;
let auth: Auth;
let pool: Pool;

beforeAll(async () => {
  db = await setupTestDb();
  ({ auth, pool } = setupTestAuth());
});

afterAll(async () => {
  await pool?.end();
  await db?.end();
});

beforeEach(async () => {
  // platform_config is intentionally NOT truncated: it holds migration-seeded
  // Platform config (the default Reward set) that every test relies on.
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
});

function app() {
  return createApp({ db, clock: systemClock, auth });
}

/** Fold a response's Set-Cookie headers into a Cookie request header value. */
function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function signUp(email: string): Promise<string> {
  const res = await app().request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "hunter2-very-secret",
      name: "Test",
    }),
  });
  expect(res.status).toBe(200);
  return cookieFrom(res);
}

async function registerCafe(name: string, cookie: string): Promise<string> {
  const res = await app().request("/api/cafes", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(201);
  return cafeSchema.parse(await res.json()).id;
}

function getProgram(cafeId: string, cookie?: string) {
  return app().request(`/api/cafes/${cafeId}/program`, {
    headers: { ...(cookie ? { cookie } : {}) },
  });
}

function putProgram(cafeId: string, body: unknown, cookie?: string) {
  return app().request(`/api/cafes/${cafeId}/program`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

// --- platform-default Reward set ----------------------------------------------

test("reward defaults require authentication", async () => {
  const res = await app().request("/api/reward-defaults");

  expect(res.status).toBe(401);
});

test("reward defaults are read from platform_config (the four platform types)", async () => {
  const cookie = await signUp("owner@example.com");

  const res = await app().request("/api/reward-defaults", {
    headers: { cookie },
  });

  expect(res.status).toBe(200);
  const defaults = rewardDefaultsSchema.parse(await res.json());
  expect(defaults.map((d) => d.type)).toEqual([
    "free_drink",
    "free_specific_drink",
    "fixed_discount",
    "percent_discount",
  ]);
});

// --- reading a Café's program -------------------------------------------------

test("reading a program requires authentication", async () => {
  const cookie = await signUp("owner@example.com");
  const cafeId = await registerCafe("Кавця", cookie);

  const res = await getProgram(cafeId);

  expect(res.status).toBe(401);
});

test("a freshly registered Café defaults to threshold 10 and no Reward", async () => {
  const cookie = await signUp("owner@example.com");
  const cafeId = await registerCafe("Кавця на Хрещатику", cookie);

  const res = await getProgram(cafeId, cookie);

  expect(res.status).toBe(200);
  const program = loyaltyProgramSchema.parse(await res.json());
  expect(program).toEqual({ threshold: 10, reward: null });
});

test("a CafeOwner cannot read another owner's program", async () => {
  const alice = await signUp("alice@example.com");
  const bob = await signUp("bob@example.com");
  const aliceCafe = await registerCafe("Alice Café", alice);

  const res = await getProgram(aliceCafe, bob);

  expect(res.status).toBe(404);
});

// --- updating a Café's program ------------------------------------------------

test("updating a program requires authentication", async () => {
  const cookie = await signUp("owner@example.com");
  const cafeId = await registerCafe("Кавця", cookie);

  const res = await putProgram(cafeId, {
    threshold: 8,
    reward: { type: "free_drink" },
  });

  expect(res.status).toBe(401);
});

test("a CafeOwner sets the threshold and Reward, and a re-read reflects it", async () => {
  const cookie = await signUp("owner@example.com");
  const cafeId = await registerCafe("Кавця на Подолі", cookie);

  const update = await putProgram(
    cafeId,
    { threshold: 8, reward: { type: "free_specific_drink", item: "Капучино" } },
    cookie,
  );

  expect(update.status).toBe(200);
  const written = loyaltyProgramSchema.parse(await update.json());
  expect(written).toEqual({
    threshold: 8,
    reward: { type: "free_specific_drink", item: "Капучино" },
  });

  const reread = loyaltyProgramSchema.parse(
    await (await getProgram(cafeId, cookie)).json(),
  );
  expect(reread).toEqual(written);
});

test("a Reward can be cleared back to null", async () => {
  const cookie = await signUp("owner@example.com");
  const cafeId = await registerCafe("Кавця", cookie);
  await putProgram(
    cafeId,
    { threshold: 10, reward: { type: "free_drink" } },
    cookie,
  );

  const res = await putProgram(cafeId, { threshold: 10, reward: null }, cookie);

  expect(res.status).toBe(200);
  const program = loyaltyProgramSchema.parse(await res.json());
  expect(program.reward).toBeNull();
});

test("a CafeOwner cannot update another owner's program", async () => {
  const alice = await signUp("alice@example.com");
  const bob = await signUp("bob@example.com");
  const aliceCafe = await registerCafe("Alice Café", alice);

  const res = await putProgram(aliceCafe, { threshold: 5, reward: null }, bob);

  expect(res.status).toBe(404);
});

test("a non-positive threshold is rejected", async () => {
  const cookie = await signUp("owner@example.com");
  const cafeId = await registerCafe("Кавця", cookie);

  const res = await putProgram(cafeId, { threshold: 0, reward: null }, cookie);

  expect(res.status).toBe(400);
});

test("a free_specific_drink Reward without an item is rejected", async () => {
  const cookie = await signUp("owner@example.com");
  const cafeId = await registerCafe("Кавця", cookie);

  const res = await putProgram(
    cafeId,
    { threshold: 10, reward: { type: "free_specific_drink" } },
    cookie,
  );

  expect(res.status).toBe(400);
});

test("a Reward type absent from the platform-default set is rejected", async () => {
  const cookie = await signUp("owner@example.com");
  const cafeId = await registerCafe("Кавця", cookie);

  // Platform retires percent_discount from the default set — no code deploy.
  const [original] = await db<{ value: unknown }[]>`
    select value from platform_config where key = 'reward_defaults'
  `;
  await db`
    update platform_config
    set value = ${db.json([
      { type: "free_drink", label: "Безкоштовний напій" },
    ])}
    where key = 'reward_defaults'
  `;

  try {
    const res = await putProgram(
      cafeId,
      { threshold: 10, reward: { type: "percent_discount", percent: 10 } },
      cookie,
    );

    expect(res.status).toBe(400);
  } finally {
    await db`
      update platform_config set value = ${db.json(original!.value as never)}
      where key = 'reward_defaults'
    `;
  }
});
