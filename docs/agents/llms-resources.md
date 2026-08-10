# LLM doc endpoints (`llms.txt`) for our stack

Many docs sites publish LLM-friendly markdown at their root so an agent can read clean text
instead of HTML soup. Use this when you need **current, version-specific** facts about a tool —
training memory gets exactly these details wrong (e.g. "is this flag default in SDK 56?"). Fetch
with `WebFetch`; it answers your prompt against the file via a small model, so a large file does
**not** flood context.

## The variants
- **`llms.txt`** — usually an **index**: a table of contents linking to individual doc pages. A *map*, not content. You then fetch the specific page.
- **`llms-small.txt`** (a.k.a. condensed-full) — the **actual docs inline**, compressed to fit a context window. Self-contained → one fetch answers the question.
- **`llms-full.txt`** — the uncompressed everything. Often huge; fetch a specific page instead.

## The rule
1. **Vendored skill first** where one exists (Expo) — it's curated *and* version-matched.
2. Else prefer a **condensed-full variant** (`llms-small.txt` / `llms-full.txt`) — one fetch, self-contained.
3. If only an **index** (`llms.txt`) exists, read it to find the right page, then **fetch that page** (`WebFetch` converts the HTML page to markdown fine).
4. **Memory last**, and only for stable fundamentals — never for version-specific behavior.
5. **Save durable findings** (to learning notes or memory) so you don't re-fetch the same fact.

## When this rule fires

Rule 4 above is the intent. It fails in practice because it asks the agent to notice it is
unsure — and the actual failure mode is *feeling certain about something stale*. Training
data contains plenty of real facts about these libraries, so a wrong version number or a
renamed API arrives with exactly the same confidence as a right one.

So the trigger is **what you are about to write, not how sure you feel**. Any of these in
your output must be checked first — no judgement call involved:

- a version number or range (`test-renderer@1.2.0`, "needs vitest >= 4")
- a third-party API, method, option, or config key (`refetchInterval`, `minimumReleaseAgeExclude`)
- a size, benchmark, or performance figure ("~13kb", "3× faster")
- a claim shaped like "X supports Y" / "X requires Y" / "X deprecated Y"

## Show the receipt

**Every checked claim carries how it was checked and when**, inline:

> `test-renderer@1.2.0`, peer `react ^19` only (npm view, 2026-08-11)
> `expo-doctor` 19/19 with `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` (run locally, 2026-08-11)

This is the part that actually works, because it is the part a human can audit. An
instruction the agent can silently skip is weak; one whose compliance is visible in the
output is enforceable.

**An unchecked claim is not forbidden — it is labelled.** "From memory, unverified: React
Query would probably absorb the polling hooks" is honest and useful. The same sentence
without the label is the failure this section exists to prevent, and it is worse when it
lands somewhere durable (an issue, an ADR, a code comment) where it will be read later as
settled fact.

## Prefer running it to reading about it

When a claim is testable in this repo in under five minutes, **test it** — docs are the
fallback, not the standard. Install the package and run `pnpm verify`; run `expo-doctor`;
write the ten-line proof-of-concept; do the install in a throwaway `git worktree`.

This is not a general preference for effort. Documentation has been wrong here twice:
Dependabot's own options reference disagreed with both its changelog and its live schema
validator (#191), and a fetched docs page produced a confident YAML example that was not
on the page. Every experiment, by contrast, gave an unambiguous answer — including one
(`pnpm install --frozen-lockfile` in a clean worktree) that exposed a broken lockfile a
warm local install had reported as fine.

**Quick checks, cheapest first:**

```sh
npm view <pkg> version peerDependencies deprecated   # before proposing ANY library
npm view <pkg> time.created time.modified            # maturity: is this a 3-month-old project?
npm view <pkg>@<version> time --json                 # publish date (release-age gate, #191)
pnpm why <pkg>                                       # what already pulls it in
```

Then install it and run the gate before recommending it, not after.

## Confirmed endpoints (checked 2026-06-26)

| Tool | Preferred | Type | Notes |
|---|---|---|---|
| **Expo / EAS** | vendored `expo:*` skills; `https://docs.expo.dev/llms.txt` as fallback | index | Skills are version-matched to our SDK — prefer them. |
| **Hono** | `https://hono.dev/llms-small.txt` | **full content** (condensed) | One-shot answers. `https://hono.dev/llms.txt` = index fallback; likely an `llms-full.txt` too. |
| **Better Auth** | `https://better-auth.com/llms.txt` | **index** (~150 pages) | No small variant. Read index → fetch the specific page. |
| **Zod** | `https://zod.dev/llms.txt` | **index** (~250 sections) | No small variant. Read index → fetch the specific page. Covers Core + Mini. |

## Not yet checked (add as we adopt them)
- **postgres.js** — likely just a GitHub README, probably no `llms.txt`.
- **Railway**, **Expo Push (expo-server-sdk)**, **Better Auth plugins** — check when we wire them.

> Maintenance: when you confirm a new tool's endpoint, add a row here with the **preferred URL +
> variant type + why**. One-time plumbing that pays off every build session.
