# Ворожка: generating and viewing the daily fortune batch

> How-to for Olek & Mari. Every command runs from the repo root in a terminal
> (or prefixed with `!` inside a Claude Code session).
>
> _Марі, привіт! Це інструкція, як «наворожити» денну порцію кавових
> передбачень і подивитися, що вийшло. Твоя головна роль — останній крок:
> прочитати їх і сказати, чи звучать вони як справжня Кавця._

## What this is

Once a day a job asks Claude (Sonnet 5, see ADR 0007) for **30 short coffee
fortunes in Ukrainian** and stores them as rows in the `fortunes` database
table — there is no file. Every scan that day shows the Customer one random
fortune from the batch (ADR 0009: the scan itself never talks to the AI, and
the Зернятко is issued even if the batch is missing — five hand-written
fallback fortunes cover that day).

In production this will run automatically (Railway cron). Locally you run it
by hand — that's this guide.

## Prerequisites (one-time)

1. **Docker Desktop is running**, and the local database is up:
   `docker compose up -d`
2. **`.env` has the Anthropic key** — the `ANTHROPIC_API_KEY=...` line in the
   repo-root `.env` (see `.env.example`, section "Anthropic API").
3. **Database schema is current** (needed after pulling new migrations):
   `pnpm --filter ./apps/api migrate`

## Generate today's batch

```
pnpm --filter ./apps/api generate-fortunes
```

- Prints `Ворожка pool ready for today (Europe/Kyiv)` on success.
- **Safe to re-run**: if today's batch already exists it does nothing and
  spends no AI call. A new batch is only generated after Kyiv midnight.
- Costs well under a cent per day.

## View the batch

```
docker exec kavtsya-db psql -U kavtsya -d kavtsya -c "select pool_day, text from fortunes order by created_at;"
```

Shows every stored fortune with the Kyiv calendar day it belongs to.
Yesterday's rows stay around — harmless; the scan only reads today's.

## Judge the quality without storing anything

```
pnpm --filter ./apps/api vorozhka-smoke
```

Prints 10 fresh fortunes straight from the model and stores **nothing** — use
this to test prompt or model changes. The prompt (tone, examples, rules) lives
in `apps/api/src/ai/claude.ts` → `fortunePrompt`; the hand-written fallback
fortunes in `apps/api/src/fortunes.ts` → `FALLBACK_FORTUNES`.

_Марі: якщо якесь ворожіння звучить криво або «не по-нашому» — запиши його.
Приклади хорошого тону, які ми даємо моделі, теж можна міняти — це твоя
територія голосу Кавці._

## If something fails

| Message | Fix |
|---|---|
| `Invalid AI environment: ANTHROPIC_API_KEY` | Add the key line to `.env` (see Prerequisites #2) |
| `relation "fortunes" does not exist` | Run the migrate command (Prerequisites #3) |
| `ECONNREFUSED ... 5432` | Start Docker Desktop, then `docker compose up -d` |
| `Claude Messages API responded 401` | The key is wrong or revoked — mint a new one at console.anthropic.com |
