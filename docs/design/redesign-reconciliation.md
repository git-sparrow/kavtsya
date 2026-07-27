# Redesign reconciliation — Mari handoff → codebase/issues

Maps the [vendored handoff](handoff/engineering-handoff.md) (9 turns, 79 screens) against what already exists in the codebase and the issue tracker. Produced during the Step-1 reconciliation pass that shaped epic **#131** and its sub-issues **#132–#139**.

Disposition legend: **RESTYLE** = existing screen, visual/UX overhaul · **NEW** = net-new screen/flow · **MOVE** = behavior relocates · **EXTENDS #n** = augments an existing issue.

| Turn | Issue | Screens | Existing code | Disposition | Flags / dependencies |
|---|---|---|---|---|---|
| **0 — Tokens** | #132 | — | `theme/design-tokens.json` | RESTYLE (foundation) | `qr-plate`, `shadow.reward`, `scrim`. Merges first; everything depends on it. |
| **1 — Customer home + redemption + Ворожка** | #133 | 1a–1r | `mode/customer-mode.tsx`, `loyalty/customer-qr.tsx`, `loyalty/cafe-balances.tsx`, `use-member-code`, `use-qr-token` | RESTYLE **+ NEW (1k) + MOVE** | **Ворожка reveal (1k) is customer-side & new** — today the fortune renders on the *barista* screen (`scan-workstation.tsx:155`). Couples #23. Redemption sheet (1g) — verify it exists customer-side vs. net-new. Bean-dot component is shared → build once here. |
| **2 — Owner scan / Scanner Mode** | #134 | 2a–2l | `scan/scan-workstation.tsx`, `mode/scanner-mode.tsx`, `owner/scan.tsx` | RESTYLE **+ MOVE** | **Remove fortune from barista screen** (`:155`) — render-only, payload untouched. Rejection copy (2f) = spec exists via closed #50. Overlaps #67 (scan-success moment). |
| **3 — Owner home + program config** | #135 | 3a–3f | `mode/owner-mode.tsx`, `loyalty/use-program-editor.ts`, `owner/[cafeId].tsx` | RESTYLE | ±stepper + radio reward cards + live bean preview. Pro pills → pitch (ADR 0011). |
| **4 — Settings + Analytics** | #136 | 4a–4e | `app/(app)/settings.tsx`, `analytics/analytics-view.tsx`, `use-analytics.ts`, `account/me-context.tsx` | RESTYLE **+ EXTENDS #123** | **Supersedes #123** (settings gear affordance) — close when this merges. Peak-hours chart depends on #112 (Kyiv business day). Email moves home→settings. **4b deletion-row = OPEN decision (brainstorm at build).** |
| **5 — Role subscreens / Pro pitch / Roster / Shifts** | #137 | 5a–5l | `owner/roster.tsx`, `owner/shifts.tsx`, `owner/campaigns.tsx`, `cafe/register-cafe-form.tsx`, `shift/request.tsx` | RESTYLE | Waiting-state anatomy (5f) becomes shared pattern (reused 7c/8b/9c). Trust rules = ADR 0013. |
| **6 — Analytics pitch + confirm dialogs** | #138 | 6a–6h | analytics pitch: `owner/analytics.tsx` · **dialogs: none** | RESTYLE (pitch) **+ NEW (dialogs)** | **Confirm-dialog component is net-new** — no Dialog/alertdialog in the tree; app currently uses OS alerts. Shared anatomy, reused across 6/7/8. 6b delete-account → **EXTENDS #81**. |
| **7 — Owner deletion exit (close café)** | #143 | 7d/7h (+ 6b/6e) | **none** | NEW | **Rescoped 2026-07-27 → delete-account exit only.** UI on top of #81's tombstone + archival, built from #138's ConfirmDialog. **7a/7e (transfer-first blocked dialog) is NOT built** — ADR 0014's «deletion is never blocked» stands, so 7d's safe action becomes «Скасувати» instead of «Краще передати кав'ярню». Both revert when #160 lands. |
| **7–8 — Café transfer + recipient accept** | #160 | 7b/7c, 7f/7g, 8a–8f | **none** | NEW — **POSTPONED** | **Out of the epic and out of v1 (2026-07-27)** → `PROJECT_BRIEF.md` Backlog. Net-new backend (invitations, ownership mutation, recipient auth, notifications) that **reverses ADR 0014's v1 rejection of transfer** — gated on a superseding ADR + explicit product approval before any implementation. |
| **9 — Client export (CSV)** | #139 | 9a–9f | **none** | NEW — **POSTPONED** | **Out of the epic and out of v1 (2026-07-27)** → `PROJECT_BRIEF.md` Backlog. The one turn that restyles nothing: needs an export endpoint (ownership enforced server-side), CSV generation, an export ledger, and the API's first transactional-email infrastructure. Adds ДАНІ section to Settings (4b) when built. **Scope = OPEN decision (brainstorm at build).** |

## Cross-cutting, do-during-restyle (not their own tickets)
- **#125** (testID props for Maestro): add stable testIDs *as* each screen is restyled, not in a later sweep.
- Shared components to build early so turns reuse them: **bean-dot progress** (turn 1), **waiting-state** (turn 5f), **confirm-dialog** (turn 6). These are the real "build once" seams.

## Existing issues this redesign touches
- **#81** account deletion + Café archival → the flow turns 6b + 7d restyle, in **#143**; stays archival-only as frozen (store-blocking). Turns 7–8 transfer screens → **#160** (postponed out of v1).
- **#123** settings gear affordance → superseded by turn 4; close when #136 merges.
- **#113** redemption-readiness predicate → dependency for reward-ready states (1f/2d/2e).
- **#112** Kyiv business day → dependency for analytics peak-hours (4d).
- **#67** branding pass (scan-success, logo placement) → coordinate with turn 2c + logo-removal.
- **#50** rejection taxonomy (closed) → spec source for 2f copy.

## Open product decisions (deferred to build-time)
1. ~~**4b / turns 7–8** — deleting an account that owns a Café: transfer-first vs ADR 0014's «deletion is never blocked».~~ **Decided 2026-07-27 — archival-first**: #81 as frozen, #143 builds the close-café confirm with no blocked dialog, transfer moves to #160 behind a superseding ADR.
2. **Turn 9** — export scope: activity-only / no contacts / free-not-Pro (handoff argues it; lock at build). Still open, now deferred with #139 itself (postponed out of v1).
