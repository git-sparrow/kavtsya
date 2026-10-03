# Exploration — measuring Ворожка repetition offline

> **Status: exploration, not a decision.** First supervised run from #277
> (task card 1), for #117. Written 2026-10-03 by Claude at commit `73f0921`.
> **All numbers come from invented corpora.** They show how the method tells
> situations apart. They say nothing about how often real fortunes repeat, and
> no product remedy is chosen here.

## For Olek — the whole thing in three lines

1. We can't know yet whether fortunes repeat too often, because there is no real data yet.
2. Once the daily job has run for about 2 weeks, run the script on those fortunes to get a few numbers.
3. Only then decide #117 (bigger batch or blocking repeats). **Nothing to do before that.**

Everything below is the method, for whoever runs that check.

## Question

What is the smallest offline evaluation that can tell **repeated fortune
text** apart from **repeated themes** across dated daily batches?

## Answer in brief

You need two columns, `(pool_day, text)`, and three separate measurements.
None of them is enough alone:

1. **Exact repeats after normalization**, within a day and across days. This is
   arithmetic.
2. **Near-duplicate candidates** across days (character-trigram similarity).
   These are candidates only.
3. **A human label** on a sample of candidates: is this the same theme or not?
   This is what turns the candidate count into an answer.

**Fallbacks are a separate mechanism.** They never appear in the pool table,
so you measure them from empty pool days, not from text similarity.

## Minimum corpus

| Field      | Source                                    | Why                                         |
| ---------- | ----------------------------------------- | ------------------------------------------- |
| `pool_day` | `fortunes.pool_day` (Kyiv day, migration 0008) | defines "within a day" and "across days" |
| `text`     | `fortunes.text`                           | the thing being compared                    |

**No Customer identity is needed.** The question is about what the generator
*supplies* each day. `generateFortunes(count)` receives no previous days, so
overlap across days is possible by construction (`apps/api/src/fortunes.ts`).
What a regular actually *sees* is a different, later question. It would need
`customer_fortunes` (migration 0015), which is per-Customer personal data, so it
should need its own justification. This corpus is not personal data.

## The four things the evaluation keeps apart

| Thing                        | How it is measured                                            | Judgement needed? |
| ---------------------------- | ------------------------------------------------------------- | ----------------- |
| Within-day duplicate text    | count of normalized duplicates inside one `pool_day`          | no                |
| Exact overlap across days    | distinct texts already seen on an earlier day                 | no                |
| Theme / semantic similarity  | trigram-Jaccard ≥ threshold → **candidates** → human labels   | **yes**           |
| Fallback serving             | days in the range with no pool rows (5 fixed texts serve)     | no                |

"Normalized" means case, punctuation and whitespace are ignored. This choice
moves the exact numbers: in corpus B below, *all* 12% of the "exact" repeats
are texts that differ only by `!` vs `.`.

## Synthetic demonstration

`python3 docs/explorations/vorozhka-repetition-eval.py` uses the standard
library only, a fixed seed, and runs in about 1.3 s. Assumptions, all
illustrative: 14 days, 30 per day (the `DAILY_BATCH_SIZE` default), and a
near-duplicate threshold of 0.5 that has **not been calibrated**.

| Metric                                         | A distinct | B reworded themes | C recycled + gaps |
| ---------------------------------------------- | ---------: | ----------------: | ----------------: |
| days with a pool / empty days                  | 14 / 0     | 14 / 0            | 12 / **2**        |
| within-day exact duplicates                    | 0          | 1                 | 0                 |
| distinct texts seen on an earlier day          | 0 (0%)     | 49 (12%)          | **320 (89%)**     |
| cross-day near-duplicate pairs (human review)  | 374        | **5 181**         | 2                 |

How to read each corpus:

- **A — every string distinct.** Exact metrics say "perfect". There are
  still 374 candidate pairs, mostly differing by one verb (*підкаже* /
  *покаже*). Whether a reader feels these as repeats is exactly the human
  question. A "0% repeats" figure from exact matching alone would overclaim.
- **B — six themes, endlessly reworded.** Pool-size arithmetic (30 distinct a
  day) and the exact metric (12%) both look acceptable. The near-duplicate
  count is ~14× higher than A's, and the top pairs are the same sentence with a
  different ending. This is the "same fortune, new words" case #117 worries
  about, and only measurement 2 + 3 shows it.
- **C — the model returns the same 40 lines; the job failed on two days.** The
  exact metric catches it directly (89%). The near-duplicate count is small
  *because* exact repeats are excluded from it, so a low candidate count is
  not a sign of variety. The two empty days are fallback days. Text analysis of
  the pool never sees them.

The lesson is that each corpus looks healthy on at least one metric. Report all
three side by side; never report a single "repetition rate".

## Limitations

- Trigram similarity only finds *lexical* closeness. "Лист принесе відповідь"
  and "Звістка прийде сама" share a theme but almost no trigrams. Theme
  repetition without shared words needs human reading of random day pairs, not
  only top-scored candidates. Embeddings could help later but mean a model
  call, which was outside this run.
- The 0.5 threshold and the pair counts depend on the generator. Real numbers
  need a threshold calibrated against human labels.
- Nothing here estimates per-Customer experience or a monthly rate. Pool size
  alone cannot give either (see #277 Evidence and limits).
- Not run: `pnpm verify`, which needs dependencies and the test database that
  this run excluded. The change is two docs files and no product code.

## Evidence still needed

1. A **real dated corpus**: `select pool_day, text from fortunes` over ≥14
   consecutive days. `docs/vorozhka-batch-howto.md` says production cron "will
   run", so this may not exist yet.
2. **Human labels** on ~30 candidate pairs spread across similarity bands, plus
   ~10 random cross-day pairs below the threshold. A native-speaker reader
   (Mari) fits that role.

## One next decision (for Olek)

**Where does the real corpus come from?** Either:

- an export of `(pool_day, text)` from production once ≥14 days exist, which
  needs read access but no Customer data, or
- deliberately generating ≥14 batches outside production, which spends the
  app's paid provider and so needs explicit approval.

Choosing a remedy from #117 (bigger batch, cross-day dedupe) should wait for
that measurement.
