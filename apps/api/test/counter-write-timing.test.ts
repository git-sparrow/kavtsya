import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";
import { withPlatformConfig } from "./helpers/platform-config";
import type { Database } from "../src/db";

let db: Database;
let auth: ReturnType<typeof setupTestAuth>["auth"];
let pool: ReturnType<typeof setupTestAuth>["pool"];
beforeAll(async () => {
  db = await setupTestDb();
  ({ auth, pool } = setupTestAuth());
});
afterAll(async () => {
  await pool.end();
  await db.end();
});
beforeEach(async () => {
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
});
async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}

const base = new Date("2026-10-13T12:00:00Z");

async function fixture(clock: { now(): Date }) {
  const app = makeApp({ db, auth, clock });
  const owner = await signUp(app, "owner@example.com");
  const barista = await signUp(app, "barista@example.com");
  const customer = await signUp(app, "customer@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  const request = async (
    method: string,
    path: string,
    cookie: string,
    body?: unknown,
  ) =>
    app.request(path, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const baristaId = (
    await json<{ id: string }>(request("GET", "/api/me", barista))
  ).id;
  const customerId = (
    await json<{ id: string }>(request("GET", "/api/me", customer))
  ).id;
  await db`update cafes set zernyatko_threshold=1, reward='{"type":"free_drink"}'::jsonb where id=${cafeId}`;
  const initial = clock.now();
  const [grant] =
    await db`insert into cafe_scanner_grants(cafe_id,user_id,created_by,created_at,expires_at)
    values(${cafeId},${baristaId},${baristaId},${initial},${new Date(initial.getTime() + 60_000)}) returning id`;
  const qrToken = (
    await json<{ token: string }>(request("GET", "/api/qr-token", customer))
  ).token;
  expect(
    (await request("POST", "/api/purchases", owner, { cafeId, qrToken }))
      .status,
  ).toBe(201);
  const memberCode = (
    await json<{ memberCode: string }>(
      request("GET", "/api/me/member-code", customer),
    )
  ).memberCode;
  return {
    app,
    request,
    owner,
    barista,
    customer,
    cafeId,
    customerId,
    grantId: String(grant!.id),
    memberCode,
  };
}

test.each(["manual", "qr", "redemption"] as const)(
  "%s uses the authorization instant as the ledger timestamp",
  async (operation) => {
    let advancing = false;
    let reads = 0;
    const f = await fixture({
      now: () => new Date(base.getTime() + (advancing ? reads++ * 1000 : 0)),
    });
    const qrToken = (
      await json<{ token: string }>(
        f.request("GET", "/api/qr-token", f.customer),
      )
    ).token;
    const expiry = new Date(
      base.getTime() +
        (operation === "redemption" ? 2 : operation === "manual" ? 3 : 4) *
          1000,
    );
    await db`update cafe_scanner_grants set expires_at=${expiry} where id=${f.grantId}`;
    advancing = true;
    const res = await f.request(
      "POST",
      operation === "redemption" ? "/api/redemptions" : "/api/purchases",
      f.barista,
      operation === "redemption"
        ? {
            cafeId: f.cafeId,
            customerId: f.customerId,
            idempotencyKey: "timing",
          }
        : operation === "manual"
          ? { cafeId: f.cafeId, memberCode: f.memberCode }
          : { cafeId: f.cafeId, qrToken },
    );
    expect(res.status).toBe(201);
    const rows =
      operation === "redemption"
        ? await db`select created_at from redemptions`
        : await db`select created_at from purchases where issued_by_user_id=(select user_id from cafe_scanner_grants where id=${f.grantId})`;
    expect((rows[0]!.created_at as Date).getTime()).toBeLessThan(
      expiry.getTime(),
    );
  },
);

async function holdTable(
  table: "purchases" | "redemptions" | "cafe_memberships",
  mode = "share",
) {
  let unlock!: () => void;
  let ready!: (pid: number) => void;
  const held = new Promise<number>((resolve) => {
    ready = resolve;
  });
  const release = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const transaction = db.begin(async (tx) => {
    await tx.unsafe(`lock table ${table} in ${mode} mode`);
    const [row] = await tx`select pg_backend_pid() as pid`;
    ready(row!.pid as number);
    await release;
  });
  return {
    pid: await held,
    release: async () => {
      unlock();
      await transaction;
    },
  };
}

async function waitForBlockedBy(pid: number, query: string) {
  for (let i = 0; i < 100; i++) {
    const rows = await db<{ pid: number }[]>`select pid from pg_stat_activity
      where datname=current_database() and ${pid}=any(pg_blocking_pids(pid)) and query like ${"%" + query + "%"}`;
    if (rows[0]) return rows[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No ${query} request blocked by ${pid}`);
}

test("revoked actor is rejected even when the Customer has no membership", async () => {
  const f = await fixture({ now: () => base });
  await db`delete from purchases`;
  await db`delete from cafe_memberships`;
  const blocker = await holdTable("cafe_memberships", "access exclusive");
  const pending = f.request("POST", "/api/redemptions", f.barista, {
    cafeId: f.cafeId,
    customerId: f.customerId,
    idempotencyKey: "empty",
  });
  try {
    await waitForBlockedBy(blocker.pid, "cafe_memberships");
    expect(
      (
        await f.request(
          "DELETE",
          `/api/cafes/${f.cafeId}/shifts/${f.grantId}`,
          f.owner,
        )
      ).status,
    ).toBe(204);
  } finally {
    await blocker.release();
  }
  expect((await pending).status).toBe(404);
  expect((await db`select count(*)::int as n from redemptions`)[0]!.n).toBe(0);
});

test.each(["manual", "qr", "redemption"] as const)(
  "%s holds its grant until commit and keeps the Shift tally",
  async (operation) => {
    let now = base;
    const f = await fixture({ now: () => now });
    const qrToken = (
      await json<{ token: string }>(
        f.request("GET", "/api/qr-token", f.customer),
      )
    ).token;
    const blocker = await holdTable(
      operation === "redemption" ? "redemptions" : "purchases",
    );
    now = new Date(base.getTime() + 1000);
    const pending = f.request(
      "POST",
      operation === "redemption" ? "/api/redemptions" : "/api/purchases",
      f.barista,
      operation === "redemption"
        ? {
            cafeId: f.cafeId,
            customerId: f.customerId,
            idempotencyKey: "locked",
          }
        : operation === "manual"
          ? { cafeId: f.cafeId, memberCode: f.memberCode }
          : { cafeId: f.cafeId, qrToken },
    );
    let revoke!: Promise<Response>;
    try {
      const writerPid = await waitForBlockedBy(
        blocker.pid,
        operation === "redemption"
          ? "insert into redemptions"
          : "insert into purchases",
      );
      now = new Date(base.getTime() + 2000);
      revoke = f.request(
        "DELETE",
        `/api/cafes/${f.cafeId}/shifts/${f.grantId}`,
        f.owner,
      );
      await waitForBlockedBy(writerPid, "update cafe_scanner_grants");
    } finally {
      await blocker.release();
    }
    expect((await pending).status).toBe(201);
    expect((await revoke).status).toBe(204);
    const [grant] =
      await db`select revoked_at from cafe_scanner_grants where id=${f.grantId}`;
    const rows =
      operation === "redemption"
        ? await db`select created_at from redemptions`
        : await db`select created_at from purchases where issued_by_user_id=(select user_id from cafe_scanner_grants where id=${f.grantId})`;
    expect((grant!.revoked_at as Date).getTime()).toBeGreaterThanOrEqual(
      (rows[0]!.created_at as Date).getTime(),
    );
    const board = await json<{ completedToday: { scanCount: number }[] }>(
      f.request("GET", `/api/cafes/${f.cafeId}/shifts`, f.owner),
    );
    expect(board.completedToday[0]?.scanCount).toBe(
      operation === "redemption" ? 0 : 1,
    );
  },
);

test.each(["manual", "redemption"] as const)(
  "%s uses the Kyiv day after a membership wait",
  async (operation) =>
    withPlatformConfig(db, "manual_entry", { dailyLimit: 2 }, async () => {
      let now = new Date("2026-10-13T20:59:59Z");
      const f = await fixture({ now: () => now });
      const blocker = await holdTable("cafe_memberships", "access exclusive");
      const body =
        operation === "redemption"
          ? {
              cafeId: f.cafeId,
              customerId: f.customerId,
              idempotencyKey: "midnight",
            }
          : { cafeId: f.cafeId, memberCode: f.memberCode };
      const pending = f.request(
        "POST",
        operation === "redemption" ? "/api/redemptions" : "/api/purchases",
        f.barista,
        body,
      );
      try {
        await waitForBlockedBy(blocker.pid, "cafe_memberships");
        now = new Date("2026-10-13T21:00:01Z");
      } finally {
        await blocker.release();
      }
      expect((await pending).status).toBe(201);
      const rows =
        operation === "redemption"
          ? await db`select created_at from redemptions`
          : await db`select created_at from purchases where entry_source='member_code'`;
      expect((rows[0]!.created_at as Date).toISOString()).toBe(
        now.toISOString(),
      );
      if (operation === "manual") {
        for (const status of [201, 429])
          expect(
            (await f.request("POST", "/api/purchases", f.owner, body)).status,
          ).toBe(status);
      }
    }),
);
