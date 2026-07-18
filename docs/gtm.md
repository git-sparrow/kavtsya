# Kavtsya — GTM recommendations

> Moved out of [`PROJECT_BRIEF.md`](../PROJECT_BRIEF.md) on 2026-07-18 (#118) so the brief stays a brief. Content from the 2026-07-06 review and the 2026-07-07 second brainstorm, with _(italic)_ status annotations added where items have since shipped. The business-model core (pricing, positioning, the Free/Pro dividing line) stays in the brief and ADR 0011 — this file is the playbook layer on top.

Honest framing first: the real competitor is not Expirenza — it is the **paper stamp card** (zero cost, zero friction, works offline). The single most likely point of death is the **install-and-signup cliff** before the first Зернятко. Structural advantage to lean on: per-Café loyalty (ADR 0001) means the product is complete and useful with **exactly one Café** — a 2–3-café pilot is a real test, not a toy. Recommendations, by leverage:

1. **Kill the install cliff.** A printed table-tent QR that opens something _instantly_ — an iOS App Clip (the `expo:add-app-clip` skill is already vendored) or a tiny web page showing today's Ворожка + "install to start collecting". First fortune before first install: the fortune is the hook, the Зернятко is the retention.
2. **Give the Free tier one teaser stat.** "27 Customers came back this month" on the CafeOwner home screen — free, one number, and it is the ad for Pro. Gating analytics entirely means Free owners never learn what they're missing. _(Shipped with #25 — the free teaser.)_
3. **Founding-café pilot.** First 5–10 Cafés get Pro free forever, in one neighborhood, in exchange for feedback + a table tent on every table. What we're buying is the **repeat-visit-rate** number — the only metric that sells Café #11.
4. **Validate Ворожка before the app carries it.** A web/Instagram «ворожіння на кавовій гущі» costs a weekend, builds the brand's social footprint, and tests whether people actually share fortunes — de-risking the shareable-card backlog item for free.
5. **Reframe the Pro pitch from "analytics" to "she came back".** Owners don't buy dashboards; they buy "Kavtsya brought Олена back after 3 weeks" — the AI win-back story ADR 0011 already names as the hero. The first Pro artifact should be a concrete win-back message, not a chart. (Related trial-design caveat: a 14-day trial of analytics over 14 days of data shows almost nothing — the trial should showcase outreach, which works from day one. See also #119, the weekly owner digest.)
6. **Buy the domains** (#1) — the cheapest risk-elimination on the board.

Added 2026-07-07 (second brainstorm):

7. **Launch on a story beat.** Candidate windows: **Oct 1** (International Coffee Day) and — the culturally exact one — **Dec 13, Андріїв день**, the traditional Ukrainian fortune-telling night (Андріївські вечорниці). A Ворожка launch on the actual ворожіння holiday is PR-ready and uncopyable by POS incumbents.
8. **Pilot in Lviv.** Ukraine's coffee capital: dense independent-café culture, an annual coffee festival to demo at, walkable neighborhoods where people pass five cafés on the way to work — the best terrain for per-Café loyalty (also on the #58 checklist).
9. **Telegram-bot Ворожка first** (#68) — Telegram is Ukraine's default app; a fortune bot costs a weekend, needs no store review, validates the hook, builds a funnel audience, and doubles as the second consumer of the `AIProvider` seam (ADR 0007).
10. **Recruit baristas, not just owners.** Baristas migrate between cafés and talk to each other — the industry's real social network. «Ворожка на зміну» (#62) makes them like the app; a barista referral makes them carry it to the next workplace.
11. **«Підтримуй свою кав'ярню» positioning.** Loyalty to local business is genuinely felt in Ukraine now, and the per-Café never-pooled model (ADR 0001) _is_ that value structurally — differentiates from bank-ecosystem loyalty that feels corporate.
12. **Customer referral loop** (#69) — "bring a friend, you both get a Зернятко here", owner-toggled per Café.
13. **Build in public on DOU.ua** — a "будую кавовий стартап з AI-агентами" series is marketing for Kavtsya _and_ career visibility at once; arguably the highest-ROI artifact even if zero cafés ever pay.
14. **Ukrainian startup ecosystem freebies** — Diia.Business consultations, Ukrainian Startup Fund, Google for Startups Ukraine: free mentorship, grants, and PR channels built for exactly this kind of project.
