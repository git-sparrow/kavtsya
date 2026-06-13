# Working on Kavtsya from your phone

Cowork sessions are desktop-only and don't sync to mobile. To get the workflow you want — add files, review code, discuss ideas, and run agents from your phone — we use two pieces together:

| What you want on mobile | Tool |
|---|---|
| Add files, review code, read diffs, discuss ideas | **GitHub** (mobile app + web) |
| Run agents / chat about the code, conversation synced | **Claude Code Remote Control** (Claude mobile app → your desktop) |

The local repo is already initialized (`git init`, first commit on `main`). Below is what only you can do.

---

## Part 1 — Put the project on GitHub

You need a GitHub account and either the `gh` CLI or a Personal Access Token. Easiest is the **GitHub CLI**.

### Option A — GitHub CLI (recommended)

```bash
# install once (macOS)
brew install gh

# authenticate (opens browser)
gh auth login

# from the project folder, create the repo and push
cd ~/Documents/development/kavtsya
gh repo create kavtsya --private --source=. --remote=origin --push
```

That creates a **private** repo named `kavtsya` and pushes `main`.

### Option B — manual (no CLI)

1. Create a new **empty** private repo on github.com named `kavtsya` (no README/license — the local repo already has commits).
2. Then:

```bash
cd ~/Documents/development/kavtsya
git remote add origin https://github.com/<your-username>/kavtsya.git
git push -u origin main
```

If prompted for a password, use a **Personal Access Token** (GitHub Settings → Developer settings → Tokens), not your account password.

### Then, on your phone

Install the **GitHub mobile app**, sign in, open `kavtsya`. You can now browse code, read diffs, comment, open issues to capture ideas, and review pull requests from anywhere. A good pattern: do work on desktop → push a branch → open a PR → review/comment on the PR from your phone.

---

## Part 2 — Run agents & discuss code from mobile (Remote Control)

Claude Code **Remote Control** links the Claude mobile app to a Claude Code session running on your Mac. You start a task at your desk and pick it up from your phone; the conversation stays in sync. **Your desktop must be on and awake** — the phone is a remote, the Mac does the work.

Setup outline (follow the official doc for the exact current toggle):

1. On your Mac, run Claude Code in the project: `cd ~/Documents/development/kavtsya && claude`
2. Enable Remote Control for the session (per the doc below) — you'll link it to your Claude account / scan a code.
3. Open the **Claude mobile app**, sign in with the same account, and you'll see the session. Send messages, run agents, review output from your phone.

Official guide: https://code.claude.com/docs/en/remote-control

---

## Recommended day-to-day flow

- **Ideas on the go** → open a GitHub Issue from your phone (or jot in the Claude mobile app).
- **Run an agent / ask Claude to change code while away** → Remote Control into the desktop session.
- **Review what it did** → read the diff / PR in the GitHub mobile app, comment, approve.
- **Heavy lifting** → desktop Cowork or Claude Code, then push.

> Reminder: the project is in **planning phase** (`PROJECT_BRIEF.md`) — discuss and design, don't scaffold app code yet.
