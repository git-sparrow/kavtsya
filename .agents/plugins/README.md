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

⚠️ **Ephemeral environments get no skills.** A fresh container or CI runner has neither the trust
flag nor a populated registry, and gets exactly one run — so it never reaches the second session
where skills appear. Pre-populate `~/.claude/plugins` via `CLAUDE_CODE_PLUGIN_SEED_DIR` (it mirrors
that directory's layout) and set the trust flag if you need these skills in CI.

⚠️ Run `claude plugin marketplace remove` **from outside this repo**, if at all: it also strips the
matching entry from the project's `.claude/settings.json`, and removing a marketplace uninstalls the
plugins that came from it.

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
