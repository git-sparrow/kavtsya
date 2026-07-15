import type { Database } from "./db";

/**
 * Customer-side push plumbing (#24): the per-device token lifecycle and the
 * café-news consent flag. Both exist before any Pro café does — they are
 * Customer infrastructure; campaigns are merely their first consumer.
 */

/**
 * Register/refresh THIS device's token. `unique (token)` makes it idempotent
 * and re-homes a handed-over device to its new account; any other token this
 * device previously held is deactivated, so one device never receives a
 * campaign twice.
 */
export async function registerPushToken(
  db: Database,
  userId: string,
  token: string,
  deviceId: string,
): Promise<void> {
  await db.begin(async (tx) => {
    await tx`
      insert into push_tokens ("user_id", "device_id", "token")
      values (${userId}, ${deviceId}, ${token})
      on conflict ("token") do update set
        "user_id" = excluded."user_id",
        "device_id" = excluded."device_id",
        "active" = true,
        "updated_at" = now()
    `;
    await tx`
      update push_tokens set "active" = false, "updated_at" = now()
      where "user_id" = ${userId} and "device_id" = ${deviceId}
        and "token" <> ${token} and "active"
    `;
  });
}

/** Flip the Customer's explicit café-news opt-in (default off, #24). */
export async function setPushConsent(
  db: Database,
  userId: string,
  consent: boolean,
): Promise<void> {
  await db`
    update "user" set "push_consent" = ${consent} where "id" = ${userId}
  `;
}

/** The consent flag as `/api/me` reports it (the settings toggle's read). */
export async function pushConsentFor(
  db: Database,
  userId: string,
): Promise<boolean> {
  const [row] = await db<{ push_consent: boolean }[]>`
    select "push_consent" from "user" where "id" = ${userId}
  `;
  return row?.push_consent ?? false;
}

/**
 * An account's active device tokens — the OPERATIONAL push target (#97,
 * ADR 0013). Deliberately NOT filtered by `push_consent`: a Roster join request
 * is a running-the-café notification the owner needs regardless of whether they
 * opted into customer marketing (#24). Marketing consent gates campaigns, never
 * this.
 */
export async function activePushTokensFor(
  db: Database,
  userId: string,
): Promise<string[]> {
  const rows = await db<{ token: string }[]>`
    select "token" from push_tokens where "user_id" = ${userId} and "active"
  `;
  return rows.map((row) => row.token);
}
