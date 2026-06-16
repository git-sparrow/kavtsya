# Зернятко issuance is independent of Ворожка

A Purchase scan issues exactly one Зернятко to the Customer's balance at that Café. Showing the Customer a Ворожка (coffee fortune) is a separate concern that must never affect whether the Зернятко is issued.

In v1 this independence is structural: Ворожка fortunes are not generated during the scan at all. A scheduled job uses the AI provider (ADR 0007) to generate a batch of generic fortunes once per day into a pool. Each Purchase scan simply reads a random fortune from that day's pool — a cheap, local lookup with no AI provider call on the request path. The AI service's latency or availability cannot influence Зернятко issuance because the scan never contacts it.

If the daily generation job fails or the pool is empty, the scan still issues the Зернятко and falls back to a default fortune (or shows none). Bean issuance is never blocked.

We rejected generating the fortune live inside the Purchase request because it would couple a loyalty guarantee — "every Purchase earns a Зернятко" — to a third-party AI service's latency and uptime. Moving generation to a scheduled batch keeps the scan fast and reliable while still exercising the AI provider abstraction.

Future: when fortunes become personalized per Customer (v2), generation may move closer to the scan, but the same rule holds — Зернятко issuance commits first and never depends on the fortune.
