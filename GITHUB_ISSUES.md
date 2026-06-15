# Starter GitHub Issues — Kavtsya

Drafted from `PROJECT_BRIEF.md` (open action items + roadmap). Create them on GitHub, then triage from the mobile app.

To create all at once, run the `gh` script at the bottom from `~/Documents/development/kavtsya`.

---

## 1. Reserve the brand — domains + social handles ⏳ (do first)

**Priority:** high · **Labels:** `chore`, `branding`

The name **Kavtsya** is unclaimed but not secured. Lock it before someone else does.

- [ ] Buy `kavtsya.com` and `kavtsya.app` (Porkbun or Namecheap)
- [ ] Consider `kavtsya.com.ua`
- [ ] Grab `@kavtsya` handles: Instagram, Telegram, TikTok, X, Facebook
- [ ] Optional: trademark check — Ukrpatent / EUIPO (classes 42 & 43)
- [ ] Note adjacent existing name to avoid confusion: «Кавуська» (retailer)

---

## ~~2. Finalize MVP feature scope~~ ✓ done 2026-06-15

Resolved in planning session. See `PROJECT_BRIEF.md` → Feature tiers.

---

## ~~3. Finalize AI scope~~ ✓ done 2026-06-15

Resolved in planning session. Ворожка in v1; churn prediction in v2. See `PROJECT_BRIEF.md` → AI scope.

---

## 4. Tech / architecture plan

**Priority:** medium · **Labels:** `planning`, `architecture` · **Milestone:** Architecture · **Blocked by:** #2, #3

Design before building. Cover:
- Expo project structure (iOS + Android)
- Auth approach
- QR generate (customer) + scan (owner) libraries
- Push notifications via Expo
- Backend choice (DB, API)
- AI service architecture (where inference runs, model/provider)

---

## 5. Write the PRD

**Priority:** medium · **Labels:** `planning` · **Milestone:** Architecture · **Blocked by:** #2, #3, #4

Turn finalized feature + AI scope and the architecture plan into a PRD, then break it into build issues (tracer-bullet vertical slices).

---

## 6. Add README + decide branch strategy

**Priority:** low · **Labels:** `chore`

- [ ] Add a `README.md` (what Kavtsya is, stack, status)
- [ ] Decide branching: trunk-based on `main`, or feature branches + PRs (PRs make mobile review nicer)

---

## Create them all (run from the repo folder)

```bash
cd ~/Documents/development/kavtsya

gh issue create --title "Reserve the brand — domains + social handles" \
  --body "Lock the Kavtsya name. Buy kavtsya.com + kavtsya.app (Porkbun/Namecheap); consider kavtsya.com.ua. Grab @kavtsya on Instagram, Telegram, TikTok, X, Facebook. Optional trademark check (Ukrpatent/EUIPO, classes 42 & 43). Avoid confusion with «Кавуська»."

gh issue create --title "Tech / architecture plan" \
  --body "Design before building: Expo structure (iOS+Android), auth, QR generate+scan libs, Expo push notifications, backend (DB/API), AI service architecture. Depends on feature + AI scope."

gh issue create --title "Write the PRD" \
  --body "Turn finalized feature + AI scope and architecture into a PRD, then break into tracer-bullet build issues. Depends on scope + architecture."

gh issue create --title "Add README + decide branch strategy" \
  --body "Add README.md (what Kavtsya is, stack, status). Decide branching: trunk-based vs feature branches + PRs (PRs make mobile review nicer)."

gh issue create --title "Owner: create custom Rewards" \
  --body "Owners can currently only pick a Reward from platform-defined defaults (free drink, fixed discount, % off). Allow owners to define a fully custom Reward — e.g. free pastry, 2-for-1, branded merchandise. Scope: UI for custom reward entry, validation, storage. Deferred from MVP; defaults cover v1."

gh issue create --title "Discovery mode — map of nearby Kavtsya cafés" \
  --body "Show a map or list of participating cafés near the customer's location. Gives the app value before a customer's first scan — useful for new users and for driving traffic to cafés. Backlog: not needed for v1 loyalty mechanics but a strong acquisition and retention hook."

gh issue create --title "Streaks — visit cadence nudges" \
  --body "Surface visit streak milestones to the customer (e.g. '3 weeks in a row at this café'). Low-pressure engagement mechanic that rewards regulars without aggressive gamification. Backlog: polish feature for after core loyalty loop ships."

gh issue create --title "Personalized push notifications based on order history" \
  --body "Send context-aware push notifications tuned to a customer's habits — e.g. 'It's cold today and you usually get a latte ☕'. Requires enough purchase history to detect patterns. Backlog: AI-powered feature for after core loyalty loop and basic push are shipped."

gh issue create --title "Seasonal and holiday Ворожка fortunes" \
  --body "Special Ворожка readings tied to Ukrainian holidays (Різдво, Великдень, etc.) and seasons. Makes the app feel alive and culturally grounded; gives push notifications a reason customers want to receive. Backlog: polish feature after core Ворожка ships."

gh issue create --title "Coffee personality profile" \
  --body "After enough purchases, surface a fun AI-generated personality label based on order patterns — e.g. 'You're a morning espresso person — bold, efficient, no nonsense.' Shareable, lightweight, powered by simple pattern matching on purchase history. Backlog: delight feature for after core loop ships."

gh issue create --title "Зернятка: issue 1 per drink instead of 1 per purchase" \
  --body "v1 issues one Зернятко per purchase visit, regardless of how many drinks were ordered. Consider switching to 1 Зернятко per drink — fairer for customers who order multiple coffees at once (e.g. for family/colleagues). Requires a quantity input step in the Owner's scan flow (e.g. a +/− stepper defaulting to 1). Brainstorm UX and decide whether the added complexity is worth the fairness improvement."

gh issue create --title "Ворожка: add drink-level data to personalize fortunes" \
  --body "v1 Ворожка generates fortunes from visit patterns only (time of day, frequency, day of week). Future enhancement: log the ordered drink during the Owner scan flow so Ворожка can reference specific drinks ('your usual cortado suggests...') for richer, more personal fortunes. Requires a drink-selection step in the scan UX — evaluate friction vs personalization gain."

gh issue create --title "Shareable Ворожка card (needs value validation)" \
  --body "After receiving a Ворожка fortune, the customer can share a branded visual card to Instagram Stories or other platforms. Potential free growth/virality mechanic — but value is unproven. NEEDS BRAINSTORM: verify whether Ukrainian coffee app users would actually share these, and whether the Kavtsya brand benefit justifies the design + implementation cost."
```

> `gh` can't set `--label`/`--milestone` unless those exist in the repo first. Create labels/milestones in the GitHub UI (or with `gh label create`) if you want them applied.
