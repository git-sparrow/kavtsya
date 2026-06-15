# Per-café loyalty: Зернятка do not pool across Cafés

Each Café runs its own independent loyalty program. A Customer's Зернятка at Café A do not count toward Café B's threshold, and each Café configures its own Reward and threshold independently.

We considered a pooled model where Зернятка accumulate across all participating Cafés toward a single platform-wide balance. We rejected it because Café owners want loyalty directed at their specific business, not at a competitor down the street — a pooled model would make the Reward budget feel like a platform subsidy rather than the owner's own incentive. It also significantly complicates the data model for no v1 benefit.

The platform is multi-café (many Cafés can join), but loyalty is per-Café.
