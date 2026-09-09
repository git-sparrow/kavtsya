import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
  cafeBalancesResponseSchema,
  deletionPreviewSchema,
  purchaseResultSchema,
} from "@kavtsya/shared";
import { deleteAccount } from "../src/account-deletion";
import type { Auth } from "../src/auth";
import type { Database } from "../src/db";
import {
  cookieFrom,
  makeApp,
  registerCafe as registerCafeAt,
  signUp,
} from "./helpers/app";
import { setupTestAuth, setupTestDb } from "./helpers/testDb";

/**
 * Account deletion (#81, ADR 0014) through the HTTP seam — the same seam the
 * auth suite uses for session behavior and the purchase/redemption suites use
 * for write-path guards.
 *
 * The suite's real subject is what deletion must NOT do: it must not touch
 * anyone else's Зернятка, must not delete a ledger row, and must not leave a
 * closed Café able to keep issuing. So most assertions are about the bystander
 * and the schema, not about the account that left.
 */

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
  await db`truncate "user", "session", "account", "verification", cafes cascade`;
});

function app() {
  return makeApp({ db, auth });
}

function registerCafe(name: string, cookie: string): Promise<string> {
  return registerCafeAt(app(), name, cookie);
}

async function setProgram(cafeId: string, cookie: string, threshold: number) {
  const res = await app().request(`/api/cafes/${cafeId}/program`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ threshold, reward: { type: "free_drink" } }),
  });
  expect(res.status).toBe(200);
}

/** One earn round through the seam; returns the scan result. */
async function earn(
  cafeId: string,
  ownerCookie: string,
  customerCookie: string,
) {
  const tokenRes = await app().request("/api/qr-token", {
    headers: { cookie: customerCookie },
  });
  expect(tokenRes.status).toBe(200);
  const { token } = (await tokenRes.json()) as { token: string };
  const res = await app().request("/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ cafeId, qrToken: token }),
  });
  expect(res.status).toBe(201);
  return purchaseResultSchema.parse(await res.json());
}

/** Confirm a Redemption through the seam — the second counter write path. */
function confirmRedemption(
  cafeId: string,
  customerId: string,
  idempotencyKey: string,
  ownerCookie: string,
) {
  return app().request("/api/redemptions", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ cafeId, customerId, idempotencyKey }),
  });
}

async function balances(cookie: string) {
  const res = await app().request("/api/me/balances", { headers: { cookie } });
  expect(res.status).toBe(200);
  return cafeBalancesResponseSchema.parse(await res.json());
}

async function preview(cookie: string) {
  const res = await app().request("/api/me/deletion-preview", {
    headers: { cookie },
  });
  expect(res.status).toBe(200);
  return deletionPreviewSchema.parse(await res.json());
}

function deleteMe(cookie: string) {
  return app().request("/api/me", { method: "DELETE", headers: { cookie } });
}

test("deletion scrubs PII but keeps the account's ledger rows", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Ранок", owner);
  const leaver = await signUp(app(), "leaver@example.com");
  const { customerId } = await earn(cafeId, owner, leaver);
  await earn(cafeId, owner, leaver);

  expect((await deleteMe(leaver)).status).toBe(204);

  const [row] = await db<
    { name: string; email: string; deleted_at: Date | null }[]
  >`select "name", "email", "deleted_at" from "user" where "id" = ${customerId}`;
  // The row itself survives — that is the whole policy (ADR 0014).
  expect(row).toBeDefined();
  expect(row!.deleted_at).not.toBeNull();
  expect(row!.name).not.toBe("Test");
  expect(row!.email).not.toBe("leaver@example.com");

  const purchases = await db`
    select 1 from purchases where "customer_user_id" = ${customerId}
  `;
  expect(purchases).toHaveLength(2);
  const identities = await db`
    select 1 from "account" where "userId" = ${customerId}
  `;
  expect(identities).toHaveLength(0);
});

test("another Customer's balance at the same Café is untouched", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Ранок", owner);
  await setProgram(cafeId, owner, 10);
  const leaver = await signUp(app(), "leaver@example.com");
  const stayer = await signUp(app(), "stayer@example.com");
  for (let i = 0; i < 4; i++) await earn(cafeId, owner, leaver);
  for (let i = 0; i < 3; i++) await earn(cafeId, owner, stayer);

  const before = await balances(stayer);
  expect((await deleteMe(leaver)).status).toBe(204);

  expect(await balances(stayer)).toEqual(before);
});

test("the deletion preview matches the balances list exactly", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const first = await registerCafe("Ранок", owner);
  const second = await registerCafe("Вечір", owner);
  await setProgram(first, owner, 10);
  await setProgram(second, owner, 5);
  const leaver = await signUp(app(), "leaver@example.com");
  for (let i = 0; i < 9; i++) await earn(first, owner, leaver);
  for (let i = 0; i < 2; i++) await earn(second, owner, leaver);

  const { balances: inventory, cafes } = await preview(leaver);

  // The screen quotes «9 зернят у «Ранок»» from the same numbers the Customer's
  // own list shows — one query, so the two can never disagree.
  expect(inventory).toEqual(await balances(leaver));
  expect(inventory.map((b) => [b.cafeName, b.balance])).toEqual(
    expect.arrayContaining([
      ["Ранок", 9],
      ["Вечір", 2],
    ]),
  );
  // A pure Customer closes no Café.
  expect(cafes).toEqual([]);
});

test("the owner's preview quantifies the Customers each Café would strand", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Демо", owner);
  await setProgram(cafeId, owner, 3);
  const holder = await signUp(app(), "holder@example.com");
  const spender = await signUp(app(), "spender@example.com");
  for (let i = 0; i < 4; i++) await earn(cafeId, owner, holder);
  let scan;
  for (let i = 0; i < 3; i++) scan = await earn(cafeId, owner, spender);
  // The spender redeems everything, so the closure costs them nothing — the
  // warning counts who actually loses Зернятка, not who ever visited.
  const redeemed = await app().request("/api/redemptions", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({
      cafeId,
      customerId: scan!.customerId,
      idempotencyKey: "spender-1",
    }),
  });
  expect(redeemed.status).toBe(201);

  const { cafes } = await preview(owner);

  expect(cafes).toEqual([{ cafeId, cafeName: "Демо", affectedCustomers: 1 }]);
});

test("deleting a pure Customer's account touches no Café", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Ранок", owner);
  const leaver = await signUp(app(), "leaver@example.com");
  await earn(cafeId, owner, leaver);

  expect((await deleteMe(leaver)).status).toBe(204);

  const [cafe] = await db<{ archived_at: Date | null }[]>`
    select "archived_at" from cafes where "id" = ${cafeId}
  `;
  expect(cafe!.archived_at).toBeNull();
});

test("sessions die with the account and a replayed cookie gets 401", async () => {
  const leaver = await signUp(app(), "leaver@example.com");
  expect((await deleteMe(leaver)).status).toBe(204);

  const me = await app().request("/api/me", { headers: { cookie: leaver } });

  expect(me.status).toBe(401);
});

test("the same email can register a fresh account, unattached to the old history", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Ранок", owner);
  await setProgram(cafeId, owner, 10);
  const leaver = await signUp(app(), "leaver@example.com");
  const { customerId: oldId } = await earn(cafeId, owner, leaver);
  await earn(cafeId, owner, leaver);
  expect((await deleteMe(leaver)).status).toBe(204);

  const reborn = await signUp(app(), "leaver@example.com");

  // A genuinely new account: new id, and the old Зернятка are unrecoverable —
  // the promise the confirm screen made (#81 user story 5).
  const me = await app().request("/api/me", { headers: { cookie: reborn } });
  expect(me.status).toBe(200);
  expect(((await me.json()) as { id: string }).id).not.toBe(oldId);
  expect(await balances(reborn)).toEqual([]);
});

test("a second delete from a stale session corrupts nothing", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Демо", owner);
  const leaver = await signUp(app(), "leaver@example.com");
  const { customerId } = await earn(cafeId, owner, leaver);

  const ownerFirst = await deleteMe(owner);
  expect(ownerFirst.status).toBe(204);
  const [after] = await db<{ archived_at: Date | null }[]>`
    select "archived_at" from cafes where "id" = ${cafeId}
  `;

  // The stale cookie now resolves to nothing, so the retry is refused rather
  // than re-running the scrub over an already-tombstoned account.
  expect((await deleteMe(owner)).status).toBe(401);

  const [unchanged] = await db<{ archived_at: Date | null }[]>`
    select "archived_at" from cafes where "id" = ${cafeId}
  `;
  expect(unchanged!.archived_at).toEqual(after!.archived_at);
  const purchases = await db`
    select 1 from purchases where "customer_user_id" = ${customerId}
  `;
  expect(purchases).toHaveLength(1);
});

test("owner deletion archives every owned Café and freezes the balances there", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const first = await registerCafe("Демо", owner);
  const second = await registerCafe("Вечір", owner);
  await setProgram(first, owner, 3);
  const customer = await signUp(app(), "customer@example.com");
  for (let i = 0; i < 2; i++) await earn(first, owner, customer);

  expect((await deleteMe(owner)).status).toBe(204);

  const rows = await db<{ id: string; archived_at: Date | null }[]>`
    select "id", "archived_at" from cafes order by "created_at" asc
  `;
  expect(rows.map((r) => r.archived_at !== null)).toEqual([true, true]);
  expect(rows.map((r) => r.id)).toEqual([first, second]);

  // The Café stays in the Customer's list, flagged closed with the Зернятка
  // they earned still shown — a balance that vanished would read as data loss.
  const list = await balances(customer);
  expect(list).toEqual([
    expect.objectContaining({ cafeId: first, balance: 2, archived: true }),
  ]);
});

test("an archived Café can no longer issue or redeem", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Демо", owner);
  await setProgram(cafeId, owner, 1);
  const customer = await signUp(app(), "customer@example.com");
  const { customerId } = await earn(cafeId, owner, customer);

  // The owner leaves; a stale scanner session tries to keep the counter open.
  const staleOwner = cookieFrom(
    await app().request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "hunter2-very-secret",
      }),
    }),
  );
  expect((await deleteMe(owner)).status).toBe(204);

  const tokenRes = await app().request("/api/qr-token", {
    headers: { cookie: customer },
  });
  const { token } = (await tokenRes.json()) as { token: string };
  const scan = await app().request("/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: staleOwner },
    body: JSON.stringify({ cafeId, qrToken: token }),
  });
  const redeem = await app().request("/api/redemptions", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: staleOwner },
    body: JSON.stringify({ cafeId, customerId, idempotencyKey: "closed-1" }),
  });

  // 401, because the tombstoned session is dead before the route is reached —
  // and the Café would answer `not_found` even to a live one (asserted below).
  expect(scan.status).toBe(401);
  expect(redeem.status).toBe(401);
});

test("a live actor's scan AND redemption at an archived Café are not_found", async () => {
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Демо", owner);
  await setProgram(cafeId, owner, 1);
  const customer = await signUp(app(), "customer@example.com");
  const { customerId } = await earn(cafeId, owner, customer);

  // Archive without deleting anyone, so the requests reaching the counter are
  // authenticated and authorized — only the Café has closed. (Deleting the owner
  // would kill the session first and mask the guard under a 401.)
  await db`update cafes set "archived_at" = now() where "id" = ${cafeId}`;

  const tokenRes = await app().request("/api/qr-token", {
    headers: { cookie: customer },
  });
  const { token } = (await tokenRes.json()) as { token: string };
  const scan = await app().request("/api/purchases", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({ cafeId, qrToken: token }),
  });
  // The balance is 1 against a threshold of 1, so this confirm would succeed at
  // an open Café — only the closure refuses it.
  const redeem = await confirmRedemption(cafeId, customerId, "closed-1", owner);

  // Indistinguishable from a Café that never existed, like every ownership miss.
  expect(scan.status).toBe(404);
  expect(((await scan.json()) as { error: string }).error).toBe("not_found");
  expect(redeem.status).toBe(404);
  expect(((await redeem.json()) as { error: string }).error).toBe("not_found");
});

test("the tombstone claim is idempotent at the module seam", async () => {
  // The HTTP path can't reach this: a second DELETE arrives on a session the
  // first one revoked, so it 401s before `deleteAccount` runs (asserted above).
  // Calling the module twice is the only way to exercise the `deleted_at is
  // null` claim — the guard that makes a retry a no-op rather than a re-scrub.
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Демо", owner);
  const customer = await signUp(app(), "customer@example.com");
  const { customerId } = await earn(cafeId, owner, customer);
  const [ownerRow] = await db<{ id: string }[]>`
    select "id" from "user" where "email" = 'owner@example.com'
  `;

  const first = new Date("2026-07-27T10:00:00.000Z");
  const second = new Date("2026-07-28T10:00:00.000Z");
  await deleteAccount(db, ownerRow!.id, first);
  await deleteAccount(db, ownerRow!.id, second);

  // The second call found nothing to claim, so neither timestamp moved…
  const [user] = await db<{ deleted_at: Date }[]>`
    select "deleted_at" from "user" where "id" = ${ownerRow!.id}
  `;
  const [cafe] = await db<{ archived_at: Date }[]>`
    select "archived_at" from cafes where "id" = ${cafeId}
  `;
  expect(user!.deleted_at).toEqual(first);
  expect(cafe!.archived_at).toEqual(first);
  // …and the ledger is untouched by either call.
  const purchases = await db`
    select 1 from purchases where "customer_user_id" = ${customerId}
  `;
  expect(purchases).toHaveLength(1);
});

test("a Customer who received a campaign push can still delete their account", async () => {
  // The regression #253 left: `push_tickets.push_token_id` references
  // `push_tokens` with no cascade, and nothing ever deletes a ticket — so one
  // campaign push used to make an account permanently undeletable, and the
  // rollback meant not a single field was scrubbed. The path is long because
  // that is the point: nothing shorter reaches a ticket row.
  const owner = await signUp(app(), "owner@example.com");
  const cafeId = await registerCafe("Кавця", owner);
  // Pro is set by the Platform's hand in v1 (migration 0011) — campaigns, and
  // therefore tickets, exist only above this line.
  await db`update cafes set "plan" = 'pro' where "id" = ${cafeId}`;

  const leaver = await signUp(app(), "leaver@example.com");
  expect(
    (
      await app().request("/api/me/push-consent", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: leaver },
        body: JSON.stringify({ consent: true }),
      })
    ).status,
  ).toBe(204);
  expect(
    (
      await app().request("/api/me/push-token", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: leaver },
        body: JSON.stringify({
          token: "ExponentPushToken[leaver-device]",
          deviceId: "leaver-phone",
        }),
      })
    ).status,
  ).toBe(204);
  // A Purchase puts them in the campaign audience (recency window, #24).
  const scan = await earn(cafeId, owner, leaver);

  const sent = await app().request(`/api/cafes/${cafeId}/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: owner },
    body: JSON.stringify({ message: "Нова кава вже у нас!" }),
  });
  expect(sent.status).toBe(201);
  const [before] = await db<{ tickets: number }[]>`
    select count(*)::int as tickets from push_tickets
  `;
  expect(before?.tickets).toBe(1);

  expect((await deleteMe(leaver)).status).toBe(204);

  // The telemetry goes with the account…
  const [after] = await db<{ tickets: number }[]>`
    select count(*)::int as tickets from push_tickets
  `;
  expect(after?.tickets).toBe(0);
  const tokens = await db`
    select 1 from push_tokens where "user_id" = ${scan.customerId}
  `;
  expect(tokens).toHaveLength(0);

  // …the ledger does not.
  const purchases = await db`
    select 1 from purchases where "customer_user_id" = ${scan.customerId}
  `;
  expect(purchases).toHaveLength(1);

  // …and the Café's own record of who the campaign reached is not rewritten by
  // someone else leaving.
  const [campaign] = await db<{ recipient_count: number }[]>`
    select "recipient_count" from campaigns where "cafe_id" = ${cafeId}
  `;
  expect(campaign?.recipient_count).toBe(1);
});

test('no FK path from "user" or cafes cascades into the ledger', async () => {
  // The migration's contract, asserted structurally (#81 user story 11): the
  // database refuses the destructive shape, so the invariant outlives anyone's
  // memory of this ticket. `account`/`session` are excluded deliberately — those
  // rows ARE deleted during the scrub and hold no ledger.
  const cascades = await db<{ table_name: string; column_name: string }[]>`
    select
      src."relname" as table_name,
      att."attname" as column_name
    from pg_constraint con
    join pg_class src on src."oid" = con."conrelid"
    join pg_class tgt on tgt."oid" = con."confrelid"
    join pg_attribute att
      on att."attrelid" = con."conrelid" and att."attnum" = con."conkey"[1]
    where con."contype" = 'f'
      and con."confdeltype" = 'c'
      and tgt."relname" in ('user', 'cafes')
      and src."relname" in ('purchases', 'redemptions', 'cafe_memberships', 'cafes')
  `;
  expect(cascades).toEqual([]);
});

/**
 * The tables `deleteAccount` deletes rows from. The `"user"` row is absent on
 * purpose: it is tombstoned by UPDATE, never deleted, so a reference to it can
 * never block anything — which is exactly what ADR 0014 bought.
 */
const CLEARED_BY_DELETION = [
  "push_tickets",
  "push_tokens",
  "customer_fortunes",
  "account",
  "session",
];

test("no FK can block a deletion: every blocking reference is into a table deletion also clears", async () => {
  // The audit above asserts nothing cascades destructively INTO the ledger.
  // This is its mirror, and the one #253 needed: nothing may point AT a table
  // the scrub empties without being emptied first, or the delete fails and the
  // account is trapped. Structural on purpose — a future table referencing
  // `push_tokens` fails here on the day it is added, not on the day a real
  // Customer tries to leave.
  const blocking = await db<{ table_name: string; references: string }[]>`
    select
      src."relname" as table_name,
      tgt."relname" as "references"
    from pg_constraint con
    join pg_class src on src."oid" = con."conrelid"
    join pg_class tgt on tgt."oid" = con."confrelid"
    where con."contype" = 'f'
      -- 'a' = NO ACTION, 'r' = RESTRICT: both refuse the delete.
      and con."confdeltype" in ('a', 'r')
      and tgt."relname" in ${db(CLEARED_BY_DELETION)}
  `;

  const unhandled = blocking.filter(
    (fk) => !CLEARED_BY_DELETION.includes(fk.table_name),
  );
  expect(unhandled).toEqual([]);
});
