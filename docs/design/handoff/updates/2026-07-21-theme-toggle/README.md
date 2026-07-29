# Update 2026-07-21 — Theme switch in Settings (Turn 10)
Add-on to the main handoff package (`handoff/README.md`, `handoff/engineering-handoff.md`). Same ground rules apply: semantic tokens only, Ukrainian «ти» copy, a11y floor.

> Vendored verbatim on 2026-07-28 as the build of #162 began. **The «Status» below is the designer's, frozen at hand-off** — what is actually built lives in `PROJECT_BRIEF.md`, the repo's one status home (#118). 10a was the treatment built.

## Status
Designed, pending approval. Two treatments on the canvas — **10a (three-way, recommended)** and 10b (binary toggle, for comparison). 10c = dark twin of 10a. Build 10a unless told otherwise.

## Files
- `theme-toggle-canvas.html` — turn 10 rendered live (10a/10b/10c with annotations); self-contained, open in any browser.

## Screens (`screens/`, @2x)
- `80-10a-…-light.png` — Customer Settings with new ВИГЛЯД section, three radio rows, «Системна» selected.
- `81-10b-…-light.png` — rejected-by-default alternative: single «Темна тема» toggle.
- `82-10c-…-dark.png` — 10a in dark, «Темна» selected.

## Spec (10a)
**Placement.** New grouped section «ВИГЛЯД» in Settings, between the identity card and СПОВІЩЕННЯ — identical rows and position in Customer AND CafeOwner settings.

**Anatomy.** ListRow group (catalog §16) with radio-card selection (catalog §05): container `surface` + `border` + `radius-md`; three 52pt rows, hairline separators:
1. «Системна» — phone glyph; caption «Слідує за налаштуванням телефона». **Default.**
2. «Світла» — sun glyph.
3. «Темна» — moon glyph.
Trailing radio: 22px ring 2px; selected = filled dot in `link` (light) / `primary` (dark — standing rule); unselected ring `border-strong`. Glyphs 24-grid, ~1.6px stroke, `currentColor`, decorative.

**Caption under the group:** «Ворожка завжди приходить у темному — це її магія, незалежно від теми.»

**Behavior.**
- Applies instantly on tap — no confirm, no restart; the settings screen itself is the live preview.
- Persisted per account; default `system`.
- The Ворожка screen renders dark in EVERY theme — its dark is the brand's magic cue, not part of the theme setting.
- Dark theme = existing `semantic.dark.*` tokens + standing dark rules (see main handoff / catalog header). No new tokens needed.

**A11y.** Group = `accessibilityRole="radiogroup"` under the «ВИГЛЯД» header; rows = `radio` with checked state; theme change announces «Тему змінено: темна/світла/системна». Whole row is the target (≥52pt).

## Why not the toggle (10b)
A binary switch can't express «як у системі»: users on OS auto-dark would have to flip it manually twice a day. Kept on the canvas for the record.

## Cross-references
- Canvas: `handoff/customer-core-loop-canvas.html` → section 10 (ids 10a/10b/10c).
- Components used: catalog §05 Radio card, §16 ListRow (`design-system/shared-components.md`).
