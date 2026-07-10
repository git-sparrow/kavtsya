# Dynamic QR code — rotating signed token

The Customer QR code rotates every ~60 seconds using a short-lived signed token rather than encoding a static user ID.

A static QR can be screenshotted and shared, allowing someone else to earn Зернятка on another Customer's account (stamp farming). A dynamic QR makes this attack impractical — the token expires before it can be meaningfully shared. The app requests a fresh token from the API on a 60-second interval; the CafeOwner scans it and the API validates the token server-side before issuing a Зернятко.

Each token is additionally **single-use for earning**: the API records the token's identifier (`jti`) when a Зернятко is issued and rejects any later scan that tries to issue against the same token. This closes the residual ~60-second window in which a double-tap or a screenshot reused before expiry could issue two Зернятка — solving double-issuance and farming together. In the schema this is simply a `unique (qr_jti)` constraint on the Purchase row, so the consumed-token check and the bean issuance are the same write. Consumed token IDs only need to be retained until the token would expire anyway.

Single-use is scoped to **earning** because the rotating QR's only job is anti-farming, which is an earning concern. **Redemption is a separate action off the same single scan** (see CONTEXT.md → Redemption) — it consumes no token. Redemption spends already-earned Зернятка in person at the counter, where a rotating token adds friction without meaningful security; accidental double-confirmation is instead prevented by an idempotency key on the Redemption, which also still allows an *intentional* second Redemption when a Customer banks multiple Rewards.

## Offline / connectivity fallback

The dynamic QR quietly depends on connectivity on both sides — the Customer's app must fetch a fresh token periodically, and the CafeOwner's scanner must validate it server-side. Ukrainian cafés have unreliable connectivity (no in-store signal, grid/power instability), so the loyalty loop needs graceful degradation. The two sides are treated differently because their reliability differs:

- **The CafeOwner device is assumed online** in v1. It is the business's device — it can fall back to mobile data, and many cafés run Starlink/backup power. The core write path (issue/redeem) requires owner connectivity.
- **The Customer's connectivity is not assumed.** The primary fallback is a short, **static member code** shown in the Customer's app and cached so it works fully offline. If the rotating QR will not scan (stale token or a bad camera read), the CafeOwner enters the member code in their (online) app to issue or redeem.

A static member code does **not** reopen the farming hole this ADR closes: the trust boundary is the CafeOwner's authenticated session plus the in-person interaction, not the code itself. To be precise about what the code binds (clarified 2026-07-10, #21 grilling): it binds earning to *the code*, not the person — a Customer who lends their code to a partner shares a balance, exactly as with a lent paper stamp card. That is accepted at paper-card trust level, because every such Purchase is a real sale; do not "fix" it with presence or identity checks. What remains impossible without staff collusion is earning with *no purchase happening at all* — the same trust level as staff hand-stamping paper cards. Both are bounded further by rate-limiting manual issuance per Customer/Café/day.

A small **grace window** past nominal token expiry is also accepted to absorb brief signal loss; single-use (`jti`) means a longer effective window still cannot yield two Зернятка. Token lifetime and grace are Platform-tunable.

*Deferred:* an **owner-offline** mode (queue earn-only with local signature validation, reconcile on reconnect) is a future enhancement — redemption cannot safely check a balance offline, so it always requires connectivity. v1 keeps the simpler "owner online" assumption.

## Implementation note

The implementation cost is low (JWT with short expiry plus a small consumed-token check) and this is the industry-standard defence used by payment QR codes and 2FA apps.
