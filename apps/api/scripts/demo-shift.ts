import { runSeed } from "./seed-world";

/**
 * Manage the demo Barista's «Зміна» for the Scanner Mode gallery lens
 * (docs/flows). A real Shift starts by scanning the café wall poster
 * (`POST /api/poster-scans` → `startShift`), which a screenshot flow can't drive
 * — these actions write/clear the same `cafe_scanner_grants` row directly:
 *
 *   demo-shift start  (default) — put barista@kavtsya.test on shift at «Кавярня «Про»» (idempotent)
 *   demo-shift end               — end any active shift, so a capture never opens into a stale kiosk
 *
 * Run after `db:seed-demo`.
 */
const action = process.argv[2] === "end" ? "end" : "start";
const SHIFT_MAX_DURATION_MS = 16 * 60 * 60 * 1000; // mirrors shifts.ts

await runSeed(async (db) => {
  const [barista] = await db<{ id: string }[]>`
    select "id" from "user" where "email" = 'barista@kavtsya.test'
  `;
  if (!barista) {
    throw new Error("demo world not seeded — run `pnpm db:seed-demo` first");
  }

  if (action === "end") {
    await db`
      update cafe_scanner_grants set "revoked_at" = now()
      where "user_id" = ${barista.id}
        and "revoked_at" is null and "expires_at" > now()
    `;
    console.log("ended any active Зміна for barista@kavtsya.test");
    return;
  }

  const [cafe] = await db<{ id: string }[]>`
    select "id" from cafes where "name" = 'Кавярня «Про»'
  `;
  if (!cafe) {
    throw new Error("demo world not seeded — run `pnpm db:seed-demo` first");
  }

  const [existing] = await db<{ id: string }[]>`
    select "id" from cafe_scanner_grants
    where "cafe_id" = ${cafe.id} and "user_id" = ${barista.id}
      and "revoked_at" is null and "expires_at" > now()
    limit 1
  `;
  if (existing) {
    console.log("barista@kavtsya.test already on shift — nothing to do");
    return;
  }

  const expiresAt = new Date(Date.now() + SHIFT_MAX_DURATION_MS);
  await db`
    insert into cafe_scanner_grants ("cafe_id", "user_id", "expires_at", "created_by")
    values (${cafe.id}, ${barista.id}, ${expiresAt}, ${barista.id})
  `;
  console.log("started Зміна for barista@kavtsya.test at «Кавярня «Про»»");
});
