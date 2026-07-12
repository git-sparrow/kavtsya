# Role Modes: derived landing, precedence, owner-primary

Decided 2026-07-12 (grilling session; replaces the flat single-screen home that stacked every role's controls together). The app presents exactly three surfaces — **Customer Mode**, **CafeOwner Mode**, **Scanner Mode** — and the surface shown on launch is **derived** from live account facts rather than stored, in a fixed precedence: **active Shift («Зміна») → Scanner Mode; else CafeOwner → CafeOwner Mode; else Customer Mode.** Switching to another Mode from Settings is a **non-persisted excursion**; the next cold launch re-derives. Because the server owns "do you have an active shift / a Café?", the visible Mode can never desync from reality, and the derivation order doubles as the role-precedence rule for an account that holds more than one role.

Two consequences are deliberate:

- **Owner-primary.** A CafeOwner lands in CafeOwner Mode by default and reaches their own Customer Mode only via Settings. We judged that real owners rarely use Kavtsya as customers, so their operator role is primary and their consumer role secondary — the reverse of the earlier implicit assumption that home is always the Customer surface. The accepted trade-off: an owner earning a Зернятко at *another* Café taps through Settings to show their QR.
- **Customer Mode stays pristine.** For a plain Customer it holds only their identity — QR, Зернятка balances, and the #24 consent card — with no café-registration form and no join-shift button. Becoming an owner moves to Settings; becoming a barista happens by scanning a Café's printed poster (ADR 0013). Nothing role-specific ever appears on a plain Customer's screen.

Considered and rejected: a **stored "last Mode"** (drifts out of sync with server truth — a revoked barista or former owner could reopen into a dead Mode); a **persistent mode-switcher control** (re-clutters the clean screen it is meant to protect, and traps an owner in the wrong Mode for a basic customer action); and **separate apps** (out of scope — ADR 0002 keeps one app).

The single governing rule — *"the app opens in your highest active role; every other role is a Settings excursion; a plain Customer only ever has Customer Mode"* — is what keeps a multi-role app from confusing or stranding anyone, which is the explicit bar for this work.
