# Working with Claude Code and Codex

Either tool can implement or review. Both follow `AGENTS.md`, the domain docs and
the same PR gate. The default is one implementer followed by the other tool's
review; switch roles whenever useful. Product status stays in `PROJECT_BRIEF.md`.

## Repository setup

| Concern | Shared source | Claude Code | Codex |
| --- | --- | --- | --- |
| Project rules | `AGENTS.md` | `CLAUDE.md` imports it | Reads `AGENTS.md` |
| Project verification | `.agents/skills/verify/` | `.claude/skills/verify/SKILL.md` symlink | Repository skill discovery |
| Argent skills | `.agents/skills/argent-*/` | `.claude/skills/` symlinks | Repository skill discovery |
| Matt Pocock skills | `.agents/plugins/mattpocock-skills/` | Existing local plugin | `.agents/skills/` symlinks to the same pin |
| Argent MCP | Local pinned dependency | `.mcp.json` | `.codex/config.toml` |
| Argent rules | `.claude/rules/argent.md` | Claude rule file | Explicit read directed by `AGENTS.md` |
| Environment inspector | `.claude/agents/argent-environment-inspector.md` | Claude agent | Thin `.codex/agents/` adapter reads the same instructions |

Keep model choices, account sign-in, credentials and personal permission settings
in each tool's user configuration. This repository config does not change the
application's AI provider or share subscription credentials between tools.

### Start a fresh checkout or worktree

1. Install the project prerequisites from `README.md`, then run
   `pnpm install --frozen-lockfile` from the checkout root.
2. Run `pnpm agents:check`. It checks the shared import, relative skill links,
   manifest coverage, inspector reference and matching Argent MCP commands.
   It requires neither an AI account nor a running simulator.
3. Open that checkout's root in the chosen client and complete its normal
   sign-in and workspace trust flow. Project Codex MCP settings require a trusted
   project. Do not copy global settings or tokens into the repo.
4. For Claude's local plugin registration, follow the existing
   [first-run instructions](../../.agents/plugins/README.md#first-run-on-a-new-machine).
   Those instructions describe the versions tested there, not a Codex setup step.
5. Confirm that `verify`, Matt's `tdd`, `to-spec`, `handoff` and the Argent skills are in
   the client's skill list. Confirm that Argent MCP tools are exposed. Restart
   the client after setup if the additions have not appeared. A configuration
   file alone is not evidence of a successful MCP connection.
6. Before actual mobile work, read `.claude/rules/argent.md` and the applicable
   setup skill. Select a device only after coordinating ownership below.

In Codex, invoke a discovered skill by its displayed name, for example
`$mattpocock-skills:tdd` or `$verify`. An isolated `skills/list` smoke check with
Codex CLI 0.155.1 on 2026-09-19 returned Matt's skills with the
`mattpocock-skills:` prefix, despite their unprefixed `SKILL.md` names.
In Claude, use `/verify` or the plugin's canonical `/mattpocock-skills:tdd`.
For Matt's review specifically, select `mattpocock-skills:code-review` from the repository skill
list in Codex, or `/mattpocock-skills:code-review` in Claude. Do not assume that
a client's built-in review command runs the pinned skill. If a pinned skill
mentions a client-specific command, follow its intent using available tools and
report any unavailable capability; do not rewrite the vendored copy.

The Expo plugin remains configured for Claude in `.claude/settings.json`. It is
not installed for Codex by this change. For Codex Expo work, use the shared Argent
workflow and the official Expo documentation route in
[llms-resources.md](llms-resources.md). Adding another plugin is a deliberate
dependency/configuration change, not a prerequisite for using both coding tools.

The existing GitHub `@claude` workflow remains as configured. Local Codex use does
not require a second GitHub AI workflow. Neither setup grants an agent permission
to merge or expands the task the user authorized.

## Taking turns: implementation and review

1. Start from an issue with acceptance criteria; follow `CONTRIBUTING.md` for
   branch naming and delivery. Record the issue, checkout path, branch and who
   currently owns edits in the task conversation.
2. The implementer edits and verifies the change. Before handing off, stop
   editing, commit intentional changes when ready, and identify any uncommitted
   work explicitly. Never stash, reset or overwrite unfamiliar changes.
3. Give the next tool the handoff below. The reviewer reads the actual diff
   against the base and checks the acceptance criteria and verification evidence.
   It starts read-only; transfer edit ownership explicitly before fixes.
4. Address valid findings, repeat affected checks, run `pnpm verify`, and inspect
   the current PR's CI. Merge only when separately authorized.

Chat history and personal memory are not the handoff. Use issues, commits, PRs and
linked evidence for durable decisions; do not maintain another product-status file.

### Handoff template

Paste into the next tool's conversation or a task-owned temporary note. The
vendored `handoff` skill can prepare it; link existing artifacts instead of
duplicating their content. Post an issue/PR comment only when the task authorizes it.

```text
Task / issue / acceptance criteria:
Checkout path / branch / base / HEAD commit:
Next role (review or implement) / current edit owner:
Changes and decisions (links):
Uncommitted or unrelated work to preserve:
Checks: exact command, commit tested, result; checks not run:
Runtime resources owned: database name, server ports, device ID, app/build:
Remaining work / known failures / next action:
```

Exclude secrets, connection strings containing credentials, cookies and private
customer data. Record resource identifiers and environment-variable names instead.

## Working concurrently

**One active editor per checkout.** Use a separate branch and worktree for each
independent implementation. Do not switch branches in another tool's working
directory. Git's worktree documentation is linked below; a typical setup is:

```sh
git fetch origin
git worktree add -b feat/issue-123 ../kavtsya-issue-123 origin/main
cd ../kavtsya-issue-123
pnpm install --frozen-lockfile
pnpm agents:check
```

Choose a unique task branch/path. Provision that checkout's ignored environment
files using the README instructions. Do not assume dependencies, environment
files or generated native builds have been provisioned in a new worktree.

Worktrees separate source edits; this project's default runtime resources are
still shared. Agree on these before starting services or checks:

| Resource | Default policy | If concurrent runtime work is necessary |
| --- | --- | --- |
| API test database | One test run at a time against the default `kavtsya_test` | Provision a separate test database for each task and set `TEST_DATABASE_URL` for every test/verify run. The test harness migrates it. |
| Development database | One session owns seeding and migrations | Use a separately provisioned database and task-local environment. Never reset another session's data. |
| API / Metro | One owner of the default ports and checkout | Coordinate distinct ports and matching mobile API/Metro configuration before starting a second stack. |
| Simulator / emulator | One owner per device | Use distinct devices and identify the app/build and attached Metro instance. |

The test harness reads `TEST_DATABASE_URL` in
`apps/api/test/helpers/testDb.ts`. Its `fileParallelism: false` setting coordinates
files within a run; it is not a cross-agent lock. Do not run simultaneous suites
against one database. `docker-compose.yml` fixes the container name and host port;
running it from another worktree is not a database-isolation recipe.

The default is serialized runtime work, so no extra database orchestration is
required to start using both tools. Record ownership in the handoff and release it
when done. Stop only task-owned processes and Argent device servers, naming the
devices used. Never run a machine-wide cleanup or `db:reset` as handoff housekeeping.

## Maintenance and verification sources

Run `pnpm agents:check` after any skill/configuration update. `pnpm verify` includes
it, and CI runs it explicitly. Preserve upstream skill contents and the manifest
pin; update only the symlinks when manifest membership changes.

Documented contracts checked on **2026-09-19**:

- [OpenAI: AGENTS.md discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
- [Claude: shared instructions via import](https://code.claude.com/docs/en/memory#import-additional-files).
- [OpenAI: skill discovery and symlink support](https://learn.chatgpt.com/docs/build-skills).
- [OpenAI: project MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
- [OpenAI: project custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- [OpenAI: app-server skill listing](https://learn.chatgpt.com/docs/app-server).
- [Git: worktrees](https://git-scm.com/docs/git-worktree).

The setup checker validates repository structure; it does not prove login,
subscription access, mobile builds, runtime behavior or client skill discovery.
Record actual smoke-check commands and isolation conditions in the setup PR.
