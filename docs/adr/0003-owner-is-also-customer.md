# CafeOwner accounts are also Customer accounts

A CafeOwner is not a separate account type — they are a Customer whose account has CafeOwner Mode unlocked. One person can collect Зернятка at other Cafés and run their own Café from the same account.

We considered separate CafeOwner and Customer accounts (distinct identities, separate registration). We rejected it because a café owner who is also a coffee lover would need two installs and two accounts for no reason. The single-account model is simpler to build, simpler to explain, and matches how people actually behave.

Consequence: the auth and account model must support a "roles" concept — an account can be Customer-only or Customer+CafeOwner. CafeOwner Mode is unlocked at signup when the user registers a Café.

Consequence (self-farming guard): a CafeOwner has **no loyalty relationship with a Café they operate**. Issuance and Redemption are rejected when the acting Customer is the Café's owner — and, for the multi-Café future, any Café the account operates. They therefore never become an Active Customer of their own Café (analytics stays honest), but remain a normal Customer at every other Café. Enforced app-side in the issue/redeem path (a cross-table CHECK cannot express it; a trigger is optional defence-in-depth, unnecessary for v1).
