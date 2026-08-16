# Vendored Claude Code plugins

Plugins committed into the repo and loaded from a **relative path**, so the pinned content lives in
version control and a checkout needs no network to get it. Same philosophy as `.agents/skills/`
(argent): everything travels with the repo.

Each plugin is declared in [`.claude/settings.json`](../../.claude/settings.json) twice — once as a
marketplace pointing at its directory, once in `enabledPlugins`:

```jsonc
"extraKnownMarketplaces": {
  "mattpocock": { "source": { "source": "directory", "path": "./.agents/plugins/mattpocock-skills" } }
},
"enabledPlugins": { "mattpocock-skills@mattpocock": true }
```

The path **must stay relative**. A relative `directory` source resolves against the repository's main
checkout (and keeps pointing there from a git worktree, so worktrees share one marketplace).
`claude plugin marketplace add <path>` writes an **absolute** path, which is machine-specific and
useless in a checkout — if you use the CLI to add a plugin here, hand-edit the path back to `./…`.

## First run on a new machine

Marketplace state is per-user, in `~/.claude/plugins/known_marketplaces.json` — **not** per project.
Committing the files is therefore not by itself enough. Two things gate the skills actually loading,
both verified against Claude Code 2.1.229 on 2026-08-13:

1. **The workspace must be trusted** — `projects["<path>"].hasTrustDialogAccepted` in
   `~/.claude.json`, set by accepting the trust dialog once. Until then the declared-marketplace
   collector returns nothing and the CLI says _"this workspace has not been trusted"_.
2. **There is a one-run lag.** The first run in a trusted workspace *registers* the marketplace
   (resolving the relative path to this checkout and writing it to `known_marketplaces.json`) but
   loads no skills in that same session. They are available from the **next** session onward.

So on a new machine: trust the folder, start Claude Code once, restart. Both steps are one-time.
Headless (`claude -p`) runs are not special — they reconcile exactly the same way; the lag is what
makes a single fresh `-p` invocation look like the config is broken when it isn't.

A local `directory` marketplace never gets an `installed_plugins.json` entry: registration alone is
what makes its plugin load. That is why there is nothing to `claude plugin install` here.

⚠️ Run `claude plugin marketplace remove` **from outside this repo**, if at all: it also strips the
matching entry from the project's `.claude/settings.json`, and removing a marketplace uninstalls the
plugins that came from it.

## CI and containers get no skills — by decision

**`@claude` runs in `.github/workflows/claude.yml` execute without these skills. Deliberately.**
`/tdd`, `/triage`, `/to-tickets`, `/to-spec`, `/domain-modeling` and the rest are a *local* authoring
tool here; nothing in CI is written to depend on them, and we chose not to spend workflow complexity
on carrying them onto a runner ([#208](https://github.com/git-sparrow/kavtsya/issues/208)). Anything
that must hold in CI belongs in the workflow itself, not in a skill. Treat a skill-less `@claude` as
the expected behaviour — not a regression to re-report.

Why it happens, verified against Claude Code 2.1.233 on 2026-08-16 with a throwaway `HOME` +
`CLAUDE_CONFIG_DIR` over a clean `git archive HEAD` checkout — a runner's exact state:

- The workspace is **untrusted**, so the declared-marketplace collector never runs.
  `claude plugin marketplace list` prints _"No marketplaces configured"_ and
  `known_marketplaces.json` is never created at all — across three consecutive invocations. This is
  a harder stop than the one-run lag above: in CI there is no second session to reach, because
  nothing registers in the first.
- `anthropics/claude-code-action` does not set the flag for us. At `d721746` its only
  `.claude.json` reference is the PR-base config restore; it contains no `hasTrustDialogAccepted`
  write. Its own trust model is about *reading* `.claude/` from cwd, which is a separate question
  from the per-user marketplace registry.

### If a future change does need them in CI

The supported lever is `CLAUDE_CODE_PLUGIN_SEED_DIR` — a `PATH`-delimited list of directories the
CLI merges into the user registry at startup (`autoUpdate: false`), read straight from the 2.1.233
binary. Each seed dir must look like:

```
<seed>/known_marketplaces.json      # { "mattpocock": { "source": { … }, "lastUpdated": "…" } }
<seed>/marketplaces/mattpocock/     # the marketplace dir itself, or a `mattpocock.json` beside it
```

A name whose `marketplaces/` entry is missing is skipped with a warning, so the two halves must
agree. Building that in a workflow step ahead of the action removes the lag entirely — it is
unimplemented because we decided against it, not because it does not work.

## `mattpocock-skills`

| | |
| --- | --- |
| Upstream | [`mattpocock/skills`](https://github.com/mattpocock/skills) |
| Version | `1.2.3` |
| Commit | `84fdeffd12f2ee307994d1eb6feb48173b6e0502` (2026-08-06) |
| Vendored | 2026-08-12, per [#194](https://github.com/git-sparrow/kavtsya/issues/194) |
| Contents | `.claude-plugin/`, `LICENSE`, and exactly the 25 skill directories `plugin.json` lists |

Matt's workflow skills — `/tdd`, `/to-spec`, `/to-tickets`, `/triage`, `/domain-modeling`, … These
replaced 21 hand-vendored copies under `.agents/skills/` plus their `.claude/skills/` symlinks and
`skills-lock.json` entries (#194). **This is an unmodified copy** — we have never customised these
skills, and keeping it faithful is what makes an update a clean re-copy rather than a merge.

Upstream ships more skills than the plugin does (`skills/in-progress/`, most of `skills/misc/`);
only the 25 in `plugin.json` are vendored, which is what the plugin would have loaded anyway.

### Why vendored rather than installed from the marketplace

`mattpocock-skills` is in the official marketplace, and installing it from there works. We vendor
instead because **a local marketplace has auto-update off by default, while official marketplaces
have it on** — an installed-from-marketplace copy would move to new upstream versions in the
background, changing skill behaviour with no diff, no PR and no review. Vendored, the pinned commit
is the committed content and an update is a reviewable diff. Both routes cost the same one-time
install prompt, so this one is strictly better for a repo that cares about reproducibility.

### Invocation

The canonical name for a plugin skill is namespaced — `/mattpocock-skills:tdd`. In practice the bare
form (`/tdd`, `/implement`, `/grilling`) also resolves, as an alias, whenever nothing else claims the
name; that is what we rely on day to day.

The exception is **`code-review`, which collides with Claude Code's built-in `/code-review`**, and a
built-in wins the bare name against a plugin. So bare `/code-review` is the built-in (effort levels,
`ultra`, `--fix`, `--comment`) and Matt's two-axis Standards/Spec review is
**`/mattpocock-skills:code-review`**. Before #194 the vendored copy shadowed the built-in and bare
`/code-review` was Matt's — that is the one behavioural change from the migration.

### Updating

Deliberate, never automatic — the same treatment argent gets:

1. Clone upstream and check out the release you want:
   `git clone https://github.com/mattpocock/skills && git checkout <tag-or-sha>`
2. Delete `.agents/plugins/mattpocock-skills/` and re-copy `.claude-plugin/`, `LICENSE`, and the
   skill directories named in the new `plugin.json` (drop any that left the manifest, add any new
   ones — the manifest is the list, not the `skills/` tree).
3. Update the version/commit/date in the table above.
4. Review the diff — that diff *is* the pin. Land it in its own PR.
