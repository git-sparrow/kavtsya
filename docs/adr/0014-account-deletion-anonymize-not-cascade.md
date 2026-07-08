# Account deletion anonymizes; the ledger is never rewritten

Decided 2026-07-08 (issue #57). In-app account deletion (required by App Store Guideline 5.1.1(v)) **tombstones** the user: PII is scrubbed (name, email, auth identities, push tokens), but `purchases` and `redemptions` rows are kept, pointing at the tombstoned user row. The `ON DELETE CASCADE` from `purchases.customer_user_id` is dropped — it contradicted ADR 0010's append-only-ledger intent, since deleting one account would silently rewrite every Café's history, balances, and analytics.

When a **CafeOwner** deletes their account, their Café is **archived, with a warning in the deletion flow** («це закриє вашу кав'ярню»): hidden from Customers, no further scans, ledger kept, Customers' balances at it frozen. Deletion is never blocked — we rejected requiring an ownership transfer first (adds friction and an unbuilt transfer feature to a legally required flow; transfer can come later) and deleting the Café outright (destroys other people's earned Зернятка).

Consequences: the FK change and a `cafes.archived_at` column ride along with #22's migration (which creates `cafe_memberships`). The deletion endpoint and UI are a later slice (before store submission, per #58); this ADR fixes the data policy now so no schema shipped in between assumes cascade semantics.
