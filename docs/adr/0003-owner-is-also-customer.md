# CafeOwner accounts are also Customer accounts

A CafeOwner is not a separate account type — they are a Customer whose account has CafeOwner Mode unlocked. One person can collect Зернятка at other Cafés and run their own Café from the same account.

We considered separate CafeOwner and Customer accounts (distinct identities, separate registration). We rejected it because a café owner who is also a coffee lover would need two installs and two accounts for no reason. The single-account model is simpler to build, simpler to explain, and matches how people actually behave.

Consequence: the auth and account model must support a "roles" concept — an account can be Customer-only or Customer+CafeOwner. CafeOwner Mode is unlocked at signup when the user registers a Café.
