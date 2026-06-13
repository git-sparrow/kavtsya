# Kavtsya (Кавця) — Coffee Loyalty App

> Context for any Claude session working in this repo (desktop Cowork, Claude Code, or mobile Remote Control).

## Status

**Planning / exploration — do not build the app yet.** See `PROJECT_BRIEF.md` for the full brief, decisions, and roadmap. The next milestone is finalizing feature + AI scope, then a tech/architecture plan, then PRD → issues → build.

## What this is

A multi-shop coffee loyalty mobile app for the Ukrainian market. Customers collect loyalty stamps across cafés (QR code → discount / free 10th coffee); owners scan QRs, send push notifications, and get AI insights. Signature feature: an AI "coffee fortune" (**Ворожка**) tied to the Ukrainian tradition of fortune-telling by coffee grounds.

Twin goals: learn AI hands-on, and refresh JS/TS/React/React Native fundamentals.

## Stack (locked in)

- **React Native + Expo** (iOS + Android)
- Push via Expo notifications
- AI as a core, deliberate feature — not a gimmick
- Native Swift may come later

## Working agreement

- Respect the planning-phase freeze: discuss, design, and document — but don't scaffold app code until the brief says build.
- Keep it simple: no redundant functionality.
- This repo enables `mp-core` + `mp-engineering` skills via `.claude/settings.json`. Run `/mp-engineering:setup-matt-pocock-skills` once before using the engineering workflow skills.

## Key files

- `PROJECT_BRIEF.md` — source of truth for scope, decisions, naming, roadmap.
- `.claude/settings.json` — enabled skill plugins.
