#!/usr/bin/env python3
"""Offline Ворожка repetition evaluation: method demo on SYNTHETIC corpora (#277, #117).

Input shape is the generated pool only: (pool_day, text), mirroring the
`fortunes` table (apps/api/migrations/0008_fortunes.sql). No Customer data, no
database, no provider calls. Every corpus below is invented; its numbers show
how the metrics separate different situations, NOT how often real fortunes repeat.

Run: python3 docs/explorations/vorozhka-repetition-eval.py   (standard library only)
"""

import random
import re
import unicodedata
from datetime import date, timedelta
from itertools import combinations

# --- Assumptions (all illustrative) ------------------------------------------
DAYS = 14             # corpus length in Kyiv days
BATCH = 30            # matches DAILY_BATCH_SIZE default (apps/api/src/fortunes.ts)
NEAR_DUP = 0.5        # trigram-Jaccard threshold for "send to a human"; uncalibrated
SEED = 277            # fixed, so output is reproducible

# Copied from apps/api/src/fortunes.ts FALLBACK_FORTUNES at 73f0921.
FALLBACKS = [
    "Кавова гуща сьогодні мовчазна, але усміхнена — день буде добрий.",
    "На дні горнятка — маленька радість, яку ти мало не проґавиш.",
    "Хтось думає про тебе за кавою просто зараз.",
    "Дорога, яку ти відкладаєш, сама зробить перший крок.",
    "Тепла звістка знайде тебе ще до вечора.",
]


# --- Metrics -----------------------------------------------------------------
def norm(text):
    """Exact-text key: case, punctuation and whitespace do not make a new fortune."""
    text = unicodedata.normalize("NFC", text).casefold()
    text = re.sub(r"[^\w\s]", " ", text)
    return " ".join(text.split())


def trigrams(text):
    t = f"  {norm(text)} "
    return {t[i : i + 3] for i in range(len(t) - 2)}


def jaccard(a, b):
    return len(a & b) / len(a | b) if a | b else 0.0


def evaluate(corpus):
    """corpus: dict pool_day -> list[text]. Returns labelled metrics."""
    days = sorted(corpus)
    fallback_keys = {norm(f) for f in FALLBACKS}
    seen = set()
    within_dupes = cross_hits = total = 0
    for day in days:
        keys = [norm(t) for t in corpus[day]]
        total += len(keys)
        within_dupes += len(keys) - len(set(keys))
        cross_hits += sum(1 for k in set(keys) if k in seen)
        seen.update(keys)

    # Near-duplicates ACROSS days among texts that are not exact repeats:
    # candidates for human theme judgement, not a verdict.
    items = [(d, t, trigrams(t)) for d in days for t in corpus[d]]
    # Counted once per distinct text pair, so a recycled line is not counted
    # again on every day it reappears.
    near = {}
    for a, b in combinations(items, 2):
        pair = tuple(sorted((norm(a[1]), norm(b[1]))))
        if a[0] == b[0] or pair[0] == pair[1] or pair in near:
            continue
        if (s := jaccard(a[2], b[2])) >= NEAR_DUP:
            near[pair] = (a[1], b[1], s)
    near = sorted(near.values(), key=lambda x: -x[2])

    all_days = [days[0] + timedelta(n) for n in range((days[-1] - days[0]).days + 1)]
    return {
        "days with a pool": len(days),
        "empty days (fallback would serve)": sum(1 for d in all_days if not corpus.get(d)),
        "texts": total,
        "within-day exact duplicates": within_dupes,
        "distinct texts seen on an earlier day": cross_hits,
        "  as % of texts": f"{100 * cross_hits / total:.0f}%",
        "cross-day near-duplicate pairs (human review)": len(near),
        "pool texts equal to a fallback": sum(
            1 for d in days for t in corpus[d] if norm(t) in fallback_keys
        ),
        "_examples": near[:3],
    }


# --- Synthetic corpora (invented text) ---------------------------------------
SUBJ = ["Несподівана зустріч", "Давній друг", "Лист", "Тиха ідея", "Нова дорога",
        "Сміливе слово", "Чужа усмішка", "Забута мелодія", "Ранковий дощ", "Кіт на підвіконні",
        "Стара книжка", "Вечірній дзвінок", "Знайомий запах", "Випадкова порада", "Квиток",
        "Відкрите вікно", "Теплий шарф", "Порожня лавка", "Перший сніг", "Синя парасоля"]
VERB = ["принесе", "відкриє", "нагадає про", "підкаже", "змінить", "поверне",
        "запалить", "розплутає", "вирішить", "покаже"]
OBJ = ["відповідь, на яку ти чекав", "сміливість спробувати знову", "забуту мрію",
       "шлях до спокою", "привід усміхнутися", "важливу розмову", "легкість у справах",
       "новий смак тижня", "давню обіцянку", "маленьке диво"]
WHEN = ["ще до обіду", "цього вечора", "у п'ятницю", "на вихідних", "до кінця тижня",
        "коли найменше чекаєш", "з першою кавою", "по дорозі додому"]


def fresh(rng, start):
    """A: every string distinct. Combinatorial, so some share all but one word."""
    used, corpus = set(), {}
    for d in range(DAYS):
        day = []
        while len(day) < BATCH:
            t = f"{rng.choice(SUBJ)} {rng.choice(VERB)} {rng.choice(OBJ)} {rng.choice(WHEN)}."
            if t not in used:
                used.add(t)
                day.append(t)
        corpus[start + timedelta(d)] = day
    return corpus


def reworded(rng, start):
    """B: every string new, but each day re-tells the same 6 themes with tiny edits."""
    themes = [(rng.choice(SUBJ), rng.choice(VERB), rng.choice(OBJ)) for _ in range(6)]
    used, corpus = set(), {}
    for d in range(DAYS):
        day = []
        while len(day) < BATCH:
            s, v, o = rng.choice(themes)
            # 6 themes x 5 openers x 8 times x 4 endings = 960 >= DAYS*BATCH strings.
            opener = rng.choice(["", "Схоже, ", "Гуща каже: ", "Бачу: ", "Здається, "])
            t = f"{opener}{s} {v} {o} {rng.choice(WHEN)}{rng.choice(['.', '!', ' — повір.', ' — ось побачиш.'])}"
            if t not in used:
                used.add(t)
                day.append(t)
        corpus[start + timedelta(d)] = day
    return corpus


def recycled(rng, start):
    """C: the model keeps returning lines from a fixed set of 40, plus two missing days."""
    stock = list(fresh(random.Random(SEED + 1), start).values())[0]
    stock += list(fresh(random.Random(SEED + 2), start).values())[0][:10]
    corpus = {}
    for d in range(DAYS):
        if d in (5, 6):  # job failed: no pool row; scans fall back
            continue
        day = rng.sample(stock, BATCH)
        day[0] = day[0].upper()  # case change must not count as a new fortune
        corpus[start + timedelta(d)] = day
    return corpus


def main():
    start = date(2026, 9, 1)
    rng = random.Random(SEED)
    corpora = {
        "A distinct": fresh(rng, start),
        "B reworded themes": reworded(rng, start),
        "C recycled + gaps": recycled(rng, start),
    }
    print(f"SYNTHETIC corpora: {DAYS} days x {BATCH}/day, seed {SEED}, near-dup >= {NEAR_DUP}\n")
    results = {name: evaluate(c) for name, c in corpora.items()}
    keys = [k for k in next(iter(results.values())) if not k.startswith("_")]
    print(f"{'metric':48}" + "".join(f"{n:>20}" for n in results))
    for k in keys:
        print(f"{k:48}" + "".join(f"{r[k]:>20}" for r in results.values()))
    for name, r in results.items():
        print(f"\n{name} - top near-duplicate pairs:")
        for a, b, s in r["_examples"] or [("(none)", "", 0)]:
            print(f"  {s:.2f}  {a}\n        {b}" if b else "  (none)")


if __name__ == "__main__":
    main()
