# Coffee Loyalty App — Project Brief

_Last updated: 2026-06-13 · Status: **planning / exploration** (do not build yet)_

## Purpose

A pet project with two real goals:

1. **Learn AI** hands-on.
2. **Refresh engineering fundamentals** (JavaScript, TypeScript, React, React Native).

The coffee-shop loyalty app is the vehicle for both. Market: **Ukraine**.

## What it is

A mobile loyalty app connecting coffee shops with their customers, plus an owner-facing side for scanning and outreach. Designed to be **simple — no redundant functionality**.

## Decisions locked in

| Area | Decision | Rationale |
|---|---|---|
| Stack | **React Native + Expo** (iOS + Android) | Reuses existing JS/TS/React strength; cross-platform; native Swift can come later |
| AI | **Core focus**, not a gimmick | The base feature set is ~90% standard CRUD; AI must be deliberate to actually learn it |
| Scope | **Multi-shop platform** | Many cafés + owners; customers collect stamps across venues |

## Core features

- Customer login and a **unique QR code** granting a discount / free 10th coffee (loyalty stamps).
- Owner app **scans** the customer QR.
- Owners send **push notifications** (menu updates, seasonal products).
- Post-purchase **"prediction / coffee fortune"** feature.

## AI directions to explore

- Personalized recommendations ("you usually order X on cold mornings").
- **Churn prediction** for owners (regulars who've stopped visiting).
- Demand forecasting.
- LLM-generated **coffee fortune** tuned to purchase history — ties neatly to the Ukrainian tradition of fortune-telling by coffee grounds (_ворожіння на кавовій гущі_), which can also anchor the brand name.

## ⏳ Open action items

- [ ] **Reserve the brand** — buy `kavtsya.com` and `kavtsya.app` (consider `.com.ua` too) via [Porkbun](https://porkbun.com) or Namecheap, and grab the `@kavtsya` social handles. _Do this soon — the name is unclaimed but not yet secured._
- [x] ~~Remove the stale `~/dev/claude-skills/mattp.skills/.git/index.lock`.~~ ✓ done 2026-06-13

## Name — **Кавця / "Kavtsya"** ✓

Chosen: **Кавця**, an affectionate diminutive of *кава* ("lil' coffee"). Latin brand spelling **Kavtsya** (pron. KAHV-tsya). The post-purchase fortune/prediction feature is branded **Ворожка** ("the fortune-teller") inside the app.

Availability (checked 2026-06-13): no app named Kavtsya/Кавця on either store, no matching coffee brand/trademark, domains appear free (no live site / search footprint). One adjacent name to note: existing retailer «Кавуська». _To finish manually: grab `kavtsya.com`/`.app` at a registrar; confirm in-store search; optional Ukrpatent/EUIPO check (classes 42/43)._

## Roadmap

1. ~~Finalize the name.~~ ✓ **Kavtsya** (pending registrar purchase)
2. **Finalize feature scope + AI scope.** ← next session
3. Tech / architecture plan (Expo, auth, QR generate/scan, push via Expo notifications, backend, AI service).
4. PRD → issues, then build.

## Dev environment

Built with Claude Code using custom skill presets from the `mp-skills` marketplace (fork `git-sparrow/mattp.skills`). This repo enables `mp-core` + `mp-engineering` via `.claude/settings.json`. Run `/mp-engineering:setup-matt-pocock-skills` once before using the engineering workflow skills.
