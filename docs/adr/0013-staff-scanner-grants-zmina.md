# Staff scan access via café-scoped scanner grants («Зміна»)

Decided 2026-07-08 (issue #56). Baristas scan Customers through a **scanner grant** — a café-scoped, time-boxed, revocable capability attached to the barista's own Customer account — not through the CafeOwner's login and not through a separate staff account type. The first surface is **«Зміна»** (Shift): the CafeOwner opens a shift (invite QR / short code), the barista's own app gains a scanner mode for that Café (scan + Redemption confirm only — no program config, no analytics), and the grant expires on its own. A locked-down counter-device surface («Стійка») reuses the same primitive as a fast-follow.

The CafeOwner account bundles three powers — identity (their personal Customer life), management (program config, campaigns, analytics), and operation (scan + confirm). A barista needs only the third, so the primitive grants only the third. This keeps ADR 0003's one-account symmetry: like CafeOwner Mode itself, Зміна is just another mode unlocked on a normal Customer account.

We considered and rejected: **sharing the owner's login** (exposes the owner's personal account and management powers, nothing self-heals when staff leave), **dedicated scanner hardware** (provisioning and support is a hardware business, and a required gadget breaks the "no POS, no IT" wedge — kept only as pilot-swag idea), **kiosk-first** (needs a spare device per café; now the fast-follow instead), **flipping the QR direction** so Customers scan a café display (changes ADR 0006's trust model — backlog experiment #61), and **per-barista PINs on a shared device** (right for v2–v3 staff attribution — backlog #62).

Consequences:

- New table `cafe_scanner_grants` (cafe_id, user_id, expires_at, revoked_at, created_by). The purchase/redemption routes accept owner **or** active-grant holder; the invite handshake can reuse the signed-token pattern from `qr-token.ts`.
- **Default grant lifetime: end of the café's business day** (café-local, Europe/Kyiv anchor), CafeOwner-configurable; owner can list and revoke active shifts. The time-box is the security model — a forgotten revocation self-heals at closing time.
- Зміна ships on the **Free** tier (the core loop is never gated, ADR 0011).
- `purchases` gains a nullable **`issued_by_user_id`** — audit trail now, shift analytics later (same anticipatory move as ADR 0012's nullable POS fields).
- The self-farm guard (ADR 0003) generalizes to **scanner ≠ scanned**: nobody may scan their own QR. A barista may still *earn* Зернятка at their shift Café when a colleague scans them — barista-pair collusion is accepted v1 risk at the same trust level as staff hand-stamping paper cards, made visible through `issued_by_user_id` rather than prevented.
