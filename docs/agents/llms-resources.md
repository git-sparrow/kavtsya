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
- **how the tooling you are operating inside behaves** — Claude Code settings keys, plugin /
  marketplace / skill resolution, hooks, MCP; and git, docker, `gh`, CI runners

That last bullet was added after #194, where the list above read as npm-shaped and so never fired
for "does a `directory` marketplace auto-register?" — a question whose answer was documented, and
which memory got wrong with total confidence. The harness is a third-party tool with versioned
behaviour like any other. It is not exempt because you are running inside it.

## Show the receipt

**Every checked claim carries how it was checked and when**, inline:

> `test-renderer@1.2.0`, peer `react ^19` only (npm view, 2026-08-11)
> `expo-doctor` 19/19 with `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` (run locally, 2026-08-11)

For a **stateful** run (see below), the receipt must also carry the **precondition** — otherwise it
is true and still misleading:

> ❌ `/tdd` resolves under the plugin (run locally, 2026-08-13)
> ✅ `/tdd` resolves under the plugin (run 2026-08-13; `known_marketplaces.json` cleared of
> `mattpocock`, workspace trusted, second session — the first registers but loads nothing)

The first sentence is what got written during #194. Every word of it was accurate. It was also
wrong, because the run had been contaminated by a previous probe — and the receipt format gave no
place to notice that.

This is the part that actually works, because it is the part a human can audit. An
instruction the agent can silently skip is weak; one whose compliance is visible in the
output is enforceable.

**A finding from another agent is a claim, not a fact.** Review output, subagent reports and
handoff notes arrive pre-formatted as conclusions, which makes them read as checked. Verify before
acting, exactly as you would your own memory — and check the *premise*, not just the conclusion. In
#194 a review finding said our `README.md` had escaped the format gate, evidenced by a
`prettier --check` run; the run passed `--ignore-path /dev/null`, which bypasses `.prettierignore`
entirely, and `*.md` there already excludes every doc in the repo. The finding was applied before
the premise was checked, then reverted.

**An unchecked claim is not forbidden — it is labelled.** "From memory, unverified: React
Query would probably absorb the polling hooks" is honest and useful. The same sentence
without the label is the failure this section exists to prevent, and it is worse when it
lands somewhere durable (an issue, an ADR, a code comment) where it will be read later as
settled fact.

## Prefer running it to reading about it — if the run is hermetic

When a claim is testable in this repo in under five minutes, **test it** — docs are the
fallback, not the standard. Install the package and run `pnpm verify`; run `expo-doctor`;
write the ten-line proof-of-concept; do the install in a throwaway `git worktree`.

**This holds only for hermetic runs**, where the state the experiment reads *is the repo*.
Every example in this section is one: `npm view` hits the registry, `--frozen-lockfile` reads
the checkout, `expo-doctor` reads `package.json`. Re-running gives the same answer on any
machine.

This is not a general preference for effort. Documentation has been wrong here twice:
Dependabot's own options reference disagreed with both its changelog and its live schema
validator (#191), and a fetched docs page produced a confident YAML example that was not
on the page. Every experiment, by contrast, gave an unambiguous answer — including one
(`pnpm install --frozen-lockfile` in a clean worktree) that exposed a broken lockfile a
warm local install had reported as fine.

## Stateful experiments: name the state, or you have an anecdote

Some questions read **machine-global mutable state** rather than the repo: `~/.claude` (plugin
registry, trust flags, settings), globally installed packages, docker volumes, package-manager
caches, `~/.gitconfig`, keychains. There, "I ran it" is not evidence — the run answers a question
about *this machine right now*, and the state may be something you yourself changed a step earlier.

Before trusting such a run:

1. **Name the state it reads**, explicitly. If you cannot, it is not an experiment yet.
2. **Isolate or clear it.** A throwaway config dir (`CLAUDE_CONFIG_DIR=/tmp/probe`), a fresh
   worktree, a container, a new path. Isolation beats cleanup — cleanup misses caches and daemons.
3. **Read the doc first.** For a documented contract, docs tell you *which variables exist* — the
   thing you need in order to control them. Docs first, then run to confirm; not instead of.
4. **Re-run after changing one variable.** A result that survives no perturbation is a coincidence.

Why this is here (#194): the question was whether a repo-declared plugin marketplace loads from
committed files alone. Three probes said yes. All three were wrong — a stale entry in
`~/.claude/plugins/known_marketplaces.json`, left by an earlier probe, was answering every one of
them. Clearing it flipped the result. Two conclusions were reported to the user as verified before
the confound surfaced, and the docs — read late — stated the governing rule outright: marketplace
state is **per-user and global, not per-project**. One fetch first would have named the variable
and saved the whole detour.

The tell: **an experiment that only ever succeeds after you have already run it once** is reading
state you are not controlling.

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
| **Claude Code** (checked 2026-08-13) | `https://code.claude.com/docs/llms.txt` | **index** | The harness itself — settings, plugins, marketplaces, skills, hooks, MCP. **`docs.claude.com/en/docs/claude-code/*` 301s here**; `WebFetch` returns the redirect rather than following it, so go straight to `code.claude.com/docs/en/<page>`. High-value pages: `discover-plugins` (team marketplaces, trust, auto-update defaults), `plugin-marketplaces` (source types, relative paths), `plugins-reference`, `settings`. Long pages get truncated mid-table — if the section you need is missing, fetch and `grep` the saved output rather than re-prompting. |

## Not yet checked (add as we adopt them)
- **postgres.js** — likely just a GitHub README, probably no `llms.txt`.
- **Railway**, **Expo Push (expo-server-sdk)**, **Better Auth plugins** — check when we wire them.

> Maintenance: when you confirm a new tool's endpoint, add a row here with the **preferred URL +
> variant type + why**. One-time plumbing that pays off every build session.
