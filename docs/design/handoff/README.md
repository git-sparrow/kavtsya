# Kavtsya — Customer Core Loop redesign · Handoff package
2026-07-20 · Turns 1–9, all screens approved. Everything a dev needs is in this folder.

## Read in this order
1. **`engineering-handoff.md`** — the spec. Every approved screen (per turn), cross-cutting decisions, copy verbatim, a11y floor.
2. **`design-system/shared-components.md`** — shared-component catalog (23 entries). Each: variants, states, token bindings, sizing, a11y. Reconciled against `mobile/src/components/`: **EXTENDS** = grow the existing primitive (Button, Surface, Text, TextField, RewardChip — add props, don't fork); **NEW** = propose a new shared component.
3. **`design-system/component-library.html`** — the same catalog rendered live from tokens, light + dark per component. Open in any browser (self-contained, works offline).
4. **`design-tokens-additions.md`** — ready-to-paste patch for `mobile/src/theme/design-tokens.json`: `qr-plate`, `shadow.reward`, `scrim`. Apply before building; the specs reference these tokens.
5. **`customer-core-loop-canvas.html`** — the full design canvas (all turns, options, annotations, rationale). Self-contained; open in a browser. Use it when a spec line needs visual context.
6. **`screens/`** — 79 PNGs @2x, `NN-{screenId}-{slug}.png`. Screen ids (1a, 2f, 9c…) match the spec and the canvas.
7. **`updates/`** — add-on turns designed after this package shipped, one dated folder each with its own README, canvas, and screens. So far: `2026-07-21-theme-toggle/` (turn 10, the Settings ВИГЛЯД switch — #162).

## Ground rules (short version)
- All colors/type/spacing via semantic tokens — no new hexes. Dark = same structure on `semantic.dark.*` plus the standing dark rules listed at the top of the catalog and in each turn's spec.
- Copy is Ukrainian, «ти» form; glossary verbatim: Кавця, Зернятко/зернята, Ворожка, Винагорода, Кавовар. No emoji.
- A11y floor: CTAs ≥44pt (usually 48), status = icon + text (never color alone), outcomes announce via live regions, decorative SVGs aria-hidden, `prefers-reduced-motion` respected.

Questions / ambiguities: check the canvas annotations first — most decisions are recorded there with the rejected alternatives.
