# Data fetching: one hand-rolled hook, not a query library

Decided 2026-08-17 (#190). Every plain read-then-render loader in the mobile app is built on **`useApiResource`** (`apps/mobile/src/lib/use-api-resource.ts`, #53) — a ~130-line hook owning loading, error, cancellation, and focus reload. We **do not** adopt TanStack Query or another data-fetching library. The three reads that are not that shape — the QR token's expiry-driven refresh, the Ворожка poll, and the member code's cache-first read — stay hand-written as themselves rather than being bent onto either abstraction.

The timing was the reason to decide now rather than later: at the point this was asked, three of the app's ten reads were on `useApiResource` and four more were about to move. Deciding after that migration would have meant rewriting seven call sites instead of three.

## What was actually checked

The first draft of #190 argued for Query from an agent's training memory — naming APIs and a bundle size that were never verified (see the correction on #190, and the rule in #192). Everything below was checked against current documentation and a real measurement on **2026-08-17**, against `@tanstack/react-query@5.101.4` (`npm view`), whose only peer dependency is `react: ^18 || ^19`.

- **Focus refetching is not free in React Native.** TanStack's own React Native page instructs you to wire `focusManager.setFocused(status === 'active')` to React Native's `AppState` yourself, and to hand-write a `useRefreshOnFocus` hook around `useFocusEffect` + `queryClient.refetchQueries({ queryKey, stale: true, type: 'active' })` for *screen* focus. The window-focus guide states plainly that window focus refetching does not work automatically in React Native. **This is the load-bearing finding:** re-reading on focus is the main thing `useFocusedApiResource` does, and it stays hand-rolled under Query too.
- **Interval polling is genuinely covered.** `refetchInterval` accepts a number *or* a function executed with the query to compute a frequency; `enabled` disables a query. `use-pending-fortune`'s "poll, but pause while a reveal is showing" is expressible.
- **An expiry-derived schedule is expressible, not free.** Because `refetchInterval` may be a function of the query, `use-qr-token` could compute the delay from the server's `expiresAt` — but as an interval recomputed after each fetch, not a one-shot timer at a deadline. Plausible; not a drop-in.
- **Offline persistence does not replace the SecureStore cache.** `persistQueryClient` restores a whole client from one persisted blob, with `buster` to invalidate incompatible caches and `maxAge` (default 24 hours) silently discarding older ones; `dehydrateOptions.shouldDehydrateQuery` filters what is written. Per-account keying (#91) is not a first-class feature, and the shipped persisters target AsyncStorage-shaped storage — moving a member code out of `expo-secure-store` to get this would be a security downgrade, which the product floor does not permit.
- **A shared cache would subsume `MeProvider`'s dedupe role.** `MeProvider` exists so `/api/me` is read once for the whole authenticated app; a client-wide cache does that by default. This is the one claim that survives intact — and it buys us the deletion of a 39-line file.
- **Bundle cost: 14.8 kB gzipped / 49.7 kB minified** — measured, not quoted. Method: `@tanstack/react-query@5.101.4` installed into an isolated scratchpad, re-exported from a single entry, bundled with esbuild (`--bundle --minify --format=esm --platform=neutral --external:react`). Metro does not tree-shake identically and ships no gzip at rest, so treat that as a floor rather than the number the app would pay.

## Why hand-rolled wins on this codebase

The strongest case for a library is the work it removes. Here it removes less than it appeared to: the focus reload — our most common read shape, on the home screen, the roster, the shifts board, and analytics — is hand-written either way, so adopting Query would mean maintaining *both* its concepts and our `AppState`/`useFocusEffect` glue. What it does cover cleanly, interval polling and expiry-derived scheduling, applies to exactly two hooks that #190 put out of scope for being unlike everything else.

Against that: a query client, query keys, staleness, garbage-collection windows, and a persistence plugin are five concepts a reader must hold to follow a screen's data flow, where today there is one hook with one contract. That is the "fewest *concepts*, not fewest screens" principle in `CLAUDE.md`, and it points the other way. The repo's other stated goal — refreshing React fundamentals by building this — is served by owning the ~130 lines, not by configuring someone else's.

## What would change our mind

This is a decision with a stated expiry condition, not a position. Revisit when any of these becomes true:

- **Mutations and cache invalidation start being hand-rolled.** Today every write is followed by an explicit reload of one screen's resource. The first time two screens must invalidate each other, we are re-deriving a cache, and a library owns that better than we will.
- **Optimistic updates or pagination arrive.** Neither exists in the app today; both are where hand-rolling stops being cheap.
- **The out-of-scope three grow to five or six.** Two exotic readers justify two bespoke hooks. Six do not.

If it is revisited, the honest comparison is against `useApiResource` *plus* whatever glue has accumulated by then — not against the four ad-hoc `useState`/`try`/`catch` loaders this ADR retires.

## Considered and rejected

**Adopting TanStack Query now.** Rejected on the verified balance above, not on unfamiliarity: it would leave the focus reload hand-written, would not carry the member code's SecureStore requirement, and would add five concepts to remove one file.

**Adopting it only for the three exotic readers.** Rejected as the worst of both — two idioms coexisting permanently is the exact failure #190 was filed to end, and it pays the full bundle and concept cost for the reads that are least alike.

**A spike before deciding.** Considered. Rejected because the finding that decides it — that React Native focus refetching is manual — is documented rather than empirical, so a spike would have confirmed what the docs already say at the cost of delaying four migrations.
