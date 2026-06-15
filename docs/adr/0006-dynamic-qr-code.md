# Dynamic QR code — rotating signed token

The Customer QR code rotates every ~60 seconds using a short-lived signed token rather than encoding a static user ID.

A static QR can be screenshotted and shared, allowing someone else to earn Зернятка on another Customer's account (stamp farming). A dynamic QR makes this attack impractical — the token expires before it can be meaningfully shared. The app requests a fresh token from the API on a 60-second interval; the CafeOwner scans it and the API validates the token server-side before issuing a Зернятко.

The implementation cost is low (JWT with short expiry) and this is the industry-standard defence used by payment QR codes and 2FA apps.
