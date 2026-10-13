import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";
import type { Database } from "../src/db";
import { authorizeCounter } from "../src/shifts";

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

for (const operation of ["manual", "qr", "redemption"] as const) {
  test.each([
    "revoked",
    "expired",
    "deleted",
    "archived",
    "customer_deleted",
    "owner_deleted",
  ] as const)(
    `${operation} rechecks %s authorization after waiting for its ledger lock`,
    async (state) => {
      let now = new Date("2026-10-12T20:59:59Z");
      const app = makeApp({ db, auth, clock: { now: () => now } });
      const owner = await signUp(app, "owner@example.com");
      const barista = await signUp(app, "barista@example.com");
      const customer = await signUp(app, "customer@example.com");
      const cafeId = await registerCafe(app, "Кавця", owner);
      const request = (
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
        (await (await request("GET", "/api/me", barista)).json()) as {
          id: string;
        }
      ).id;
      const customerId = (
        (await (await request("GET", "/api/me", customer)).json()) as {
          id: string;
        }
      ).id;
      await db`update cafes set zernyatko_threshold=1, reward='{"type":"free_drink"}'::jsonb where id=${cafeId}`;
      const [grant] = await db`
        insert into cafe_scanner_grants(cafe_id,user_id,created_by,expires_at)
        values(${cafeId},${baristaId},${baristaId},${new Date(now.getTime() + 60_000)}) returning id
      `;
      const qr = (
        (await (await request("GET", "/api/qr-token", customer)).json()) as {
          token: string;
        }
      ).token;
      expect(
        (
          await request("POST", "/api/purchases", owner, {
            cafeId,
            qrToken: qr,
          })
        ).status,
      ).toBe(201);
      const memberCode = (
        (await (
          await request("GET", "/api/me/member-code", customer)
        ).json()) as { memberCode: string }
      ).memberCode;
      const freshQr = (
        (await (await request("GET", "/api/qr-token", customer)).json()) as {
          token: string;
        }
      ).token;
      let blockerPid = 0;
      let unlock!: () => void;
      let locked!: () => void;
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const release = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const blocker = db.begin(async (tx) => {
        await tx`select 1 from cafe_memberships where cafe_id=${cafeId} and customer_user_id=${customerId} for update`;
        blockerPid = (await tx`select pg_backend_pid() as pid`)[0]!
          .pid as number;
        locked();
        await release;
      });
      await ready;
      const pending = request(
        "POST",
        operation === "redemption" ? "/api/redemptions" : "/api/purchases",
        state === "owner_deleted" ? owner : barista,
        operation === "manual"
          ? { cafeId, memberCode }
          : operation === "qr"
            ? { cafeId, qrToken: freshQr }
            : { cafeId, customerId, idempotencyKey: "blocked-confirm" },
      );
      try {
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const blocked =
            await db`select 1 from pg_stat_activity where datname=current_database() and ${blockerPid}=any(pg_blocking_pids(pid)) and query like '%cafe_memberships%'`;
          if (blocked.length > 0) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
        if (state === "revoked") {
          expect(
            (
              await request(
                "DELETE",
                `/api/cafes/${cafeId}/shifts/${String(grant!.id)}`,
                owner,
              )
            ).status,
          ).toBe(204);
        } else if (state === "expired") {
          now = new Date(now.getTime() + 60_001);
        } else {
          expect(
            (
              await request(
                "DELETE",
                "/api/me",
                state === "deleted"
                  ? barista
                  : state === "customer_deleted"
                    ? customer
                    : owner,
              )
            ).status,
          ).toBe(204);
        }
      } finally {
        unlock();
        await blocker;
      }
      expect((await pending).status).toBe(404);
      expect(
        (
          await db`select count(*)::int as n from purchases where cafe_id=${cafeId}`
        )[0]?.n,
      ).toBe(1);
      expect(
        (
          await db`select count(*)::int as n from redemptions where cafe_id=${cafeId}`
        )[0]?.n,
      ).toBe(0);
    },
  );
}

test("the counter gate rejects a missing or tombstoned account and still names a self-scan", async () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const app = makeApp({ db, auth, clock: { now: () => now } });
  const owner = await signUp(app, "owner@example.com");
  const customer = await signUp(app, "customer@example.com");
  const cafeId = await registerCafe(app, "Кавця", owner);
  const idOf = async (cookie: string) =>
    (
      (await (
        await app.request("/api/me", { headers: { cookie } })
      ).json()) as { id: string }
    ).id;
  const ownerId = await idOf(owner);
  const customerId = await idOf(customer);
  const gate = (customer: string) =>
    authorizeCounter(db, {
      cafeId,
      actorUserId: ownerId,
      customerId: customer,
      now,
    });

  expect(await gate(customerId)).toMatchObject({ ok: true });
  expect(await gate(ownerId)).toEqual({ ok: false, reason: "self_scan" });
  expect(await gate("no-such-user")).toEqual({
    ok: false,
    reason: "cafe_not_owned",
  });
  expect(
    (
      await app.request("/api/me", {
        method: "DELETE",
        headers: { cookie: customer },
      })
    ).status,
  ).toBe(204);
  expect(await gate(customerId)).toEqual({
    ok: false,
    reason: "cafe_not_owned",
  });
});
