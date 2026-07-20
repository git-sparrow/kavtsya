# Design

Vendored design materials for the app, so tickets, checkouts, and cloud agents resolve specs and screens from an in-repo path (no per-machine folders, same philosophy as the vendored skills).

- **`handoff/`** — frozen snapshot of the Customer Core Loop redesign (Mari handoff, 2026-07-20).
  - `engineering-handoff.md` — per-screen anatomy, decisions, deleted screens, cross-cutting rules. The spec.
  - `design-tokens-additions.md` — the `qr-plate` / `shadow.reward` / `scrim` token patch (turn 0 / #132).
  - `screens/` — 79 approved PNGs (light + dark), referenced by number in the sub-issues.
  - `customer-core-loop-canvas.html` — the source canvas the handoff was cut from.
- **`redesign-reconciliation.md`** — maps each turn → existing code / issue → disposition. The map behind epic #131.

**Authoring source of truth** stays `KavtsyaCreative/design-system/` (Mari's working directory, not a git repo). This folder is the frozen deliverable that ships with the code. If the handoff is revised there, re-vendor it in a fresh PR — don't hand-edit the snapshot.
