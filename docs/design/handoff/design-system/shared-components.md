# Kavtsya — Customer Core Loop · Shared-component catalog
Date: 2026-07-20 · Source: `Customer Core Loop.dc.html` (turns 1–9, all approved) · Companion to `../engineering-handoff.md`
All values are semantic tokens from `mobile/src/theme/design-tokens.json` (+ the three additions in `../design-tokens-additions.md`: `qr-plate`, `shadow.reward`, `scrim`). No new hexes. Dark = same structure on `semantic.dark.*` unless a dark rule below says otherwise.

Reconciliation legend, per component:
- **EXTENDS `<existing>`** — grows a variant/state on a primitive already in `mobile/src/components/` (Button, Card, Surface, Text, TextField, RewardChip). Don't fork; add props.
- **NEW** — genuinely new shared element; propose as a new file in `components/`.

---

## 1. Button — EXTENDS `button.tsx`
Existing: `variant: primary | secondary`, `disabled`, `busy`, minHeight 48, `radius-md`.
The redesign uses four variants; two exist, two are additions:

| Variant | Bindings | Used on |
|---|---|---|
| `primary` (exists) | bg `primary`, text `primary-foreground` 700 16 | every main CTA (1k, 2c, 5a, 9b…) |
| `secondary` (exists) | 1px `border` outline — redesign consistently uses **`border-strong`** for the outline (1d retry, 2b back, 5e fallback); recommend changing the existing token binding from `border` → `border-strong` | retry, back, fallback, «Сканувати ще» demoted (2d) |
| **`danger` (NEW variant)** | solid `danger`, text `#fff` light / `semantic.dark.background` dark (dark `danger` is salmon — white fails AA) | destructive confirms only (6b, 7d) |
| **`quiet` (NEW variant)** | no border, no bg; text `text-secondary` 600; 40–44pt | «Пізніше», «Скасувати запит», «Відхилити» (1l, 5f, 7c, 8a) |

States: default / pressed (`primary-active` + subtle scale-down) / `disabled` (opacity .6, exists) / `busy` (exists — keep, but replace the "..." label with an inline spinner glyph + retain label for a11y) / focus (`--focus` ring). Sizing: primary CTAs 48pt; hero scan button (3a) is a one-off 56pt via style override, not a variant. A11y: never «Так/Ні» alone — verbs on labels; busy announces via `accessibilityState.busy`.

## 2. Surface (content card) — EXTENDS `surface.tsx`
Existing: `surface` bg, `radius-lg`, `space-5` padding, `shadow.card`. The redesign keeps it as the base card and adds three border treatments as a prop (`emphasis`):
- `default` (exists) — add hairline `border` (redesign shows it on all cards; dark requires it since surfaces ≈ background).
- **`reward` (NEW)** — 1.5px `primary` border + `shadow.reward` gold glow (1f café card, 2d confirm card, 5a/6a/8a offer cards).
- **`promise` (NEW)** — bg `primary-surface`, no shadow; hairline `border` in dark only (Берегиня promise/safety cards: 5d, 7b, 8a, 9b; 1d code hero).
States: none interactive. A11y: purely presentational; never the focus target.

## 3. Card (layout column) — KEEP `card.tsx` as-is
Unchanged: stretch column, gap `space-3`. The redesign's screens compose with it; no new variants.

## 4. Text — EXTENDS `text.tsx`
Existing roles map cleanly; additions are size/color parameters, not new components:
- `Heading` (exists, Cormorant 600 2xl) — redesign sizes: screen title 24 (4a), waiting/success title 26 (5f, 9c), dialog title 23 (turn 6), serif promise 22 (5a). Add a `size` prop.
- `SectionLabel` (exists) — redesign spec: 11px/700, ls 1.5–2, `text-muted`; optionally prefixed by a 13px Берегиня mark in `primary` (aria-hidden) — 1a «МОЇ КАВ'ЯРНІ».
- `Title`, `Muted`, `ErrorText` (exist) — unchanged; note redesign floor: muted text ≥13px except section labels/kickers.
- `OwnerBadge` (exists) — superseded by the **Role header** (§7); keep for the kicker line inside it (retune to 11/700 ls2 `text-muted`).
- **Tabular numerals (NEW rule, not component)** — member code 24–28px, stepper value 34px, stat values 26px, poster code 22px: `fontVariant: ['tabular-nums']`.

## 5. TextField — EXTENDS `text-field.tsx`
Existing: 1px `border`, `radius-md`, `surface` bg. Redesign adds:
- **Persistent label** above the value (11px/700 ls1.5 `text-muted`, uppercase) — placeholder NEVER doubles as label (5d, 7b). Wrap as a `LabeledField` composition, or add a `label` prop.
- **Focus state**: 1.5px `primary` border + caret (reduced-motion → static caret) (5d).
- **Error state**: danger strip *below* the field (§11), field border → `danger` — pattern of 3b validation.
- Placeholder examples in `text-muted` («Наприклад, Львів»). Min height 48pt.

## 6. RewardChip → Radio card — EXTENDS `reward-chip.tsx`
Existing chip (border → `primary` + `primary-surface` when active) is the seed of the redesign's **radio card** (3b rewards, 7b roster pick): 48pt row, selected = `primary-surface` + 1.5px `primary` + filled radio dot in `link` (22px ring); unselected = `surface` + `border`; inline ₴/% parameter on discount rows. Add `selected` radio semantics (`accessibilityRole="radio"`, group container). States: default / selected / disabled (opacity .6) / focus ring.

---

## NEW shared elements (no existing primitive)

## 7. RoleHeader — NEW
Kicker (11px/700, ls 2, `text-muted`, uppercase: «РЕЖИМ КАВОВАРА», «АНАЛІТИКА · PRO», «ЕКСПОРТ БАЗИ») + café name (`font-display` 600 22–24) + optional trailing 44pt icon target (settings on home, back «top-right» on subscreens). Used on every owner/pro screen (2a, 3a, 4d, 5a, 9b). No logo ever (logo = sign-in + splash only). A11y: café name is the screen's `accessibilityRole="header"`.

## 8. BeanRow (bean-dot progress) — NEW
Coffee-bean-shaped dots (oval + curved espresso crease), NOT circles. Filled = `primary` fill + crease in `primary-foreground` @ .55; empty = dashed `border-strong` outline. Sizes: inline (café row 1a), large (program preview 3b, redemption 1f, Ворожка card 1k). Always paired with a text count («4 зернятка · ще 1 до Винагороди») — the row itself is aria-hidden; the text carries the value. States: partial / full (reward-ready — pairs with §9 chip) / post-redeem remainder (1h). No animation except a gentle fade on increment.

## 9. StatusStrip — NEW
One anatomy, four intents; the app's inline outcome/status banner (never a toast):
- `success` — `success-surface` bg, check glyph + title in `success`, detail `text-secondary` (1h, 2c, 3c with 1px `success` border + solid badge circle).
- `danger` — `danger-surface`, alert glyph `danger`, bold title + recovery instruction in `text-secondary` (1d, 2f, 3b validation).
- `info/excluded` — plain ✕ or info glyph in `text-muted`, copy `text-secondary`, no tinted bg needed (9b exclusion) — informational, NOT danger.
- `reward` — chip form: «★ Винагорода готова», `primary` bg / `primary-foreground` text (1f, 2d kicker).
Rules: icon + text always, never color alone; `radius-md`; outcome strips are live regions (`role="status"` / `accessibilityLiveRegion="polite"`, danger = assertive).

## 10. ConfirmDialog — NEW
Replaces OS alerts (turn 6 anatomy, used 6b–6g, 7a, 7d, 8c): scrim `scrim` token (rgba(27,20,44,.5) light / rgba(10,7,20,.6) dark); card `surface` + `radius-xl`; context chip (glyph or avatar on `primary-surface`/`danger-surface` circle) → serif title 23 → body `text-secondary` → stacked full-width 48pt buttons, confirm on top. `role="alertdialog"`, focus trapped. Variants: `neutral` (confirm `primary`, focus on confirm — 6c, 8c), `danger` (confirm solid `danger` per §1; focus on the SAFE action; safe action is a real alternative, not «Скасувати» when a better exit exists — 7d), `blocked` (no confirm; exits as buttons — 7a). Esc/scrim-tap = cancel everywhere EXCEPT delete-account-class dialogs (explicit buttons only).

## 11. WaitingState / OutcomeScreen — NEW
Full-screen result anatomy (5f family: 5f, 7c, 8b, 9c, and compact form 1h): 76px circle in `primary-surface` (pending) or `success-surface` (done) with glyph in `primary`/`success` — or Берегиня for brand moments (8b); serif title 26; body names what happens next; primary 48pt CTA + optional quiet secondary. Never a spinner alone, never a toast. Live region on mount. States: pending (clock) / success (check/envelope) / brand-unlock (Берегиня).

## 12. OfferCard (Pro pitch / invite) — NEW
5a anatomy, reused 6a, 8a: Surface `emphasis="reward"` (§2) → Берегиня 22px `primary` (or inviter avatar chip, 8a) → serif promise 22 → checklist rows: `success` check glyph + text (16px glyph, 2.4px stroke); `warning` glyph row for obligations (8a). Companion **price strip** on `primary-surface`: «Pro — від ₴390/міс · 14 днів безкоштовно». CTA per ADR 0011 (Telegram) or accept/decline pair (8a). Checks are icon+text list items, not bullets.

## 13. StatCard — NEW
4d trio: `surface` card, value 26px tabular, label `text-muted` 12; accent variant = `primary-surface` bg + `primary` border for the highlighted metric («Повернулися»). States: loading = skeleton value bar 20% opacity; empty/error handled at screen level (§9 + Берегиня empty state). Always accompanied by a one-line glossary — the card alone never defines its metric.

## 14. SegmentedControl — NEW
4d 7/30-day pill: container `surface` + `border`, `radius-full`; selected segment `primary` bg + `primary-foreground` text 600; unselected `text-secondary`. 44pt height. Radio-group semantics (`accessibilityRole="radiogroup"`, segments `radio`). Two–three segments max.

## 15. Avatar — NEW
Circle on `primary-surface`, serif initial in `link` (light) / `primary` (dark). Sizes: 40px identity/list rows (4a, 5b), chip-size 28–32px in dialogs (6c, 8a). **Dark rule (standing): every dark avatar gains a 1px `primary` ring** — `primary-surface` ≈ surface in dark, the circle vanishes otherwise. Paired live-status: green dot + text («на зміні») — never dot alone. Decorative; name text carries semantics.

## 16. ListRow — NEW
Grouped settings/menu rows (3a, 4a, 9a): container `surface` + `border` + `radius-md`, rows 52pt min, hairline `border` separators; leading line icon (24-grid, 1.6px stroke, round caps, `currentColor`), title 15/600, optional caption 12.5 `text-muted`, trailing chevron / toggle / badge. Variants: navigation (chevron), toggle (§17), danger (`danger` text + glyph — «Видалити акаунт»), badge (PRO pill §18). Whole row is the 52pt touch target.

## 17. Toggle — NEW
4a: on = `primary` track + white knob; off = `border-strong` outline track. Announced «увімкнено/вимкнено» (`accessibilityRole="switch"`). Always with a caption explaining scope.

## 18. Badge / Pill — NEW
Uppercase 10–12px/700–800 ls1–2, `radius-full`. Variants: **PRO** and **КАВОВАР** = `secondary` bg + neutral-100 text in light; **in dark = `primary` + `primary-foreground`** (never `secondary` — lavender in dark; standing rule). Count badge (5b requests) = `primary`+`primary-foreground`. Reward chip «★ …» see §9. Non-interactive; adjacent row remains the target.

## 19. Stepper — NEW
3b threshold: − / + as 44pt round buttons (− secondary outline, + `primary`), value 34px tabular between. `accessibilityRole="adjustable"` with increment/decrement actions. Always paired with a live preview (BeanRow) captioned «Так це побачить клієнт».

## 20. ViewfinderWell — NEW
2a/5e camera plate: full-width square, `radius-lg`, bg `secondary` (light) / near-black (dark) / `semantic.dark.background` (5e, + hairline `border` when on dark); gold corner brackets + scan line in `primary` (decorative, aria-hidden; brackets stop ~64px above bottom edge); in-frame hint text in neutral-100 / `semantic.dark.text-secondary`, below the brackets. Reduced-motion: scan line static.

## 21. QRPlate — NEW
QR always renders on the **`qr-plate`** token (white) with espresso modules — in BOTH themes (scanability). No center logo (decision, rejected). Live-token cue below: slow `primary` ring (aria-hidden, `vorozhka`-family motion) + «Код живий — оновлюється сам» `text-muted` 12. Member code fallback: 24px tabular + dictation hint.

## 22. BottomSheet — NEW (single use so far — 1g; promote only if reused)
`surface`, `radius-xl` top corners, drag handle, scrim = `scrim` token. Contents follow §11 anatomy. Flagged: one instance; keep screen-local until a second sheet appears.

---

## Cross-cutting (applies to every component above)
- Touch targets ≥44pt (CTAs 48pt; hero scan 56pt). Status = icon + text, never color alone. Outcome changes announce via live regions. Decorative SVGs (Берегиня, brackets, bean crease) aria-hidden.
- Icons: on demand, 24 grid, ~1.6px stroke, round caps/joins, `currentColor` — no icon set, no emoji.
- Dark standing rules (turns 4–9): avatar `primary` ring; badges → `primary`/`primary-foreground`; `primary-surface` cards gain hairline `border`; QR on `qr-plate`; deep scrim; dark danger confirm fg = `semantic.dark.background`.
- Motion: gentle fades, soft ease-out; the only signature loop is the Ворожка swirl (5s `vorozhka` token). Respect `prefers-reduced-motion` everywhere a state above names an animation.
