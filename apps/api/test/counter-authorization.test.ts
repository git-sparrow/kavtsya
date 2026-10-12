import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { makeApp, registerCafe, signUp } from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";
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

for (const operation of ["manual", "redemption"] as const) {
  test.each(["revoked", "expired", "deleted", "archived"] as const)(
    `${operation} rechecks %s authorization after waiting for its ledger lock`,
    async (state) => {
      let now = new Date("2026-10-12T12:00:00Z");
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
        locked();
        await release;
      });
      await ready;
      const pending = request(
        "POST",
        operation === "manual" ? "/api/purchases" : "/api/redemptions",
        barista,
        operation === "manual"
          ? { cafeId, memberCode }
          : { cafeId, customerId, idempotencyKey: "blocked-confirm" },
      );
      try {
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const blocked =
            await db`select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and pid<>pg_backend_pid()`;
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
                state === "deleted" ? barista : owner,
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
