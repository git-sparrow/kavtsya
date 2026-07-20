# Design

Vendored design materials for the app, so tickets, checkouts, and cloud agents resolve specs and screens from an in-repo path (no per-machine folders, same philosophy as the vendored skills).

- **`handoff/`** — frozen snapshot of the Customer Core Loop redesign (Mari handoff, 2026-07-20). `handoff/README.md` is the design team's own reading-order index.
  - `engineering-handoff.md` — per-screen anatomy, decisions, deleted screens, cross-cutting rules. The spec.
  - `design-system/shared-components.md` — **shared-component catalog** (23 entries): each with variants, states, token bindings, sizing, a11y. Reconciled against `apps/mobile/src/components/` — `EXTENDS` = grow the existing primitive (add props, don't fork), `NEW` = propose a new component. The component contract behind the redesign.
  - `design-system/component-library.html` — the same catalog rendered live from tokens, light + dark per component; self-contained, opens offline.
  - `design-tokens-additions.md` — the `qr-plate` / `shadow.reward` / `scrim` token patch (turn 0 / #132).
  - `screens/` — 79 approved PNGs (light + dark), referenced by number in the sub-issues.
  - `customer-core-loop-canvas.html` — the source canvas the handoff was cut from.
- **`redesign-reconciliation.md`** — maps each turn → existing code / issue → disposition. The map behind epic #131.
- **`INTEGRATION.md`** — Mari's token-integration guide (Ukrainian): semantic-tokens-are-the-API principle, the "Variant A" theme build that `apps/mobile/scripts/build-theme.mjs` implements, Expo font setup, RN accessibility-in-code rules, and the design→code sync cycle. Referenced by comments in `build-theme.mjs` and `components/button.tsx`.

**Authoring source of truth** stays `KavtsyaCreative/design-system/` (Mari's working directory, not a git repo). This folder is the frozen deliverable that ships with the code. If the handoff is revised there, re-vendor it in a fresh PR — don't hand-edit the snapshot.
