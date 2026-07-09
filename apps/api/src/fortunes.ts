import type { AIProvider } from "./ai";
import type { Clock } from "./clock";
import type { Database } from "./db";

/**
 * The daily Ворожка pool (#23): a scheduled job generates a batch of generic
 * fortunes through the AIProvider (ADR 0007); each scan draws one at random.
 * The scan path never calls the model (ADR 0009) — if the pool is missing the
 * caller falls back, and the Зернятко is issued regardless.
 */

/**
 * How many fortunes one day's batch holds when the caller doesn't say —
 * the batch script overrides this per environment via `FORTUNES_BATCH_SIZE`.
 */
export const DAILY_BATCH_SIZE = 30;

/**
 * The pool is keyed to the Europe/Kyiv calendar day (not server/UTC): Ukrainian
 * cafés must not see the pool roll over mid-evening. `en-CA` formats as
 * YYYY-MM-DD, which is exactly Postgres's `date` literal.
 */
const kyivDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Kyiv",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function kyivDayOf(instant: Date): string {
  return kyivDayFormat.format(instant);
}

export interface GenerateDailyFortunesOptions {
  provider: AIProvider;
  clock: Clock;
  count?: number;
}

/**
 * Fill today's (Kyiv) pool through the provider. Idempotent per day — a retry
 * (cron re-run, manual invocation) sees the existing pool and doesn't spend an
 * AI call. Generation happens before any write, so a provider failure leaves
 * the pool exactly as it was.
 */
export async function generateDailyFortunes(
  db: Database,
  { provider, clock, count = DAILY_BATCH_SIZE }: GenerateDailyFortunesOptions,
): Promise<void> {
  const poolDay = kyivDayOf(clock.now());
  const [existing] = await db<{ count: string }[]>`
    select count(*) from fortunes where "pool_day" = ${poolDay}::date
  `;
  if (Number(existing?.count ?? 0) > 0) return;

  const fortunes = await provider.generateFortunes(count);
  await db`
    insert into fortunes ("pool_day", "text")
    select ${poolDay}::date, t.text
    from unnest(${fortunes}::text[]) as t(text)
  `;
}

/** A random fortune from today's (Kyiv) pool, or null when the pool is empty. */
export async function pickFortune(
  db: Database,
  clock: Clock,
): Promise<string | null> {
  const poolDay = kyivDayOf(clock.now());
  const rows = await db<{ text: string }[]>`
    select "text" from fortunes
    where "pool_day" = ${poolDay}::date
    order by random()
    limit 1
  `;
  return rows[0]?.text ?? null;
}

/**
 * Hand-written safety net (ADR 0009): when the daily job failed or hasn't run,
 * the Ворожка moment still happens — a generic fortune from this list instead
 * of a dark screen. Authored, not generated; edits are a normal code review.
 */
export const FALLBACK_FORTUNES: readonly string[] = [
  "Кавова гуща сьогодні мовчазна, але усміхнена — день буде добрий.",
  "На дні горнятка — маленька радість, яку ти мало не проґавиш.",
  "Хтось думає про тебе за кавою просто зараз.",
  "Дорога, яку ти відкладаєш, сама зробить перший крок.",
  "Тепла звістка знайде тебе ще до вечора.",
];

/** What the scan shows: today's pool if it has fortunes, else a fallback. */
export async function fortuneForScan(
  db: Database,
  clock: Clock,
): Promise<string> {
  const fromPool = await pickFortune(db, clock);
  if (fromPool !== null) return fromPool;
  return FALLBACK_FORTUNES[
    Math.floor(Math.random() * FALLBACK_FORTUNES.length)
  ]!;
}
