# Dynamic QR code — rotating signed token

The Customer QR code rotates every ~60 seconds using a short-lived signed token rather than encoding a static user ID.

A static QR can be screenshotted and shared, allowing someone else to earn Зернятка on another Customer's account (stamp farming). A dynamic QR makes this attack impractical — the token expires before it can be meaningfully shared. The app requests a fresh token from the API on a 60-second interval; the CafeOwner scans it and the API validates the token server-side before issuing a Зернятко.

Each token is additionally **single-use**: the API records the token's identifier (`jti`) on the first successful scan and rejects any later scan of the same token. This closes the residual ~60-second window in which a double-tap or a screenshot reused before expiry could issue two Зернятка — solving double-issuance and farming together. Consumed token IDs only need to be retained until the token would expire anyway.

The implementation cost is low (JWT with short expiry plus a small consumed-token check) and this is the industry-standard defence used by payment QR codes and 2FA apps.
