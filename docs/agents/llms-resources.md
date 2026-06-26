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
