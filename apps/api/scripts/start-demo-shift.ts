import { runSeed } from "./seed-world";

/**
 * Put the demo Barista on an active «Зміна» at the Pro café, so the Scanner Mode
 * lens (docs/flows) can be captured reproducibly. A real Shift starts when the
 * barista scans the café's wall poster (`POST /api/poster-scans` → `startShift`),
 * which a screenshot flow can't drive — this writes the same `cafe_scanner_grants`
 * row directly. Idempotent: an already-active grant is reused, so re-runs are a
 * no-op. Run after `db:seed-demo`.
 */
const SHIFT_MAX_DURATION_MS = 16 * 60 * 60 * 1000; // mirrors shifts.ts

await runSeed(async (db) => {
  const [barista] = await db<{ id: string }[]>`
    select "id" from "user" where "email" = 'barista@kavtsya.test'
  `;
  const [cafe] = await db<{ id: string }[]>`
    select "id" from cafes where "name" = 'Кавярня «Про»'
  `;
  if (!barista || !cafe) {
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
