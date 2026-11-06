# The public site is a static Astro app in `apps/web`, served by Cloudflare Workers static assets

Decided 2026-11-06 (#352). The stores need a privacy-policy URL, an account-deletion page (Google Play) and a Support URL (App Store Connect) before the first submission (#65), and ADR 0019 promised a privacy notice for crash reporting. This ADR picks the framework, host and CI shape. The pages themselves come in later PRs.

## Decision

**`apps/web` is an Astro site with static output, no adapter and no UI framework, built to `dist/` and served as Workers static assets. Workers Builds deploys it from `main` with root directory `apps/web`.**

- **Astro, static.** Astro pre-renders every page at build time. The site ships no client JavaScript unless a page asks for it, which suits prose pages and keeps `react-dom` out of the tree (`scripts/deps-check/check-deps.mjs`). `site` is `https://kavtsya.com`.
- **No Cloudflare adapter.** Cloudflare's Astro guide says: "If you want to use Astro as a static site generator, you do not need the Astro Cloudflare adapter", and a static site's `wrangler.jsonc` has only `name`, `compatibility_date` and `assets.directory: "./dist"`, with no `main` (read 2026-11-06). Bindings are unavailable on a purely static site, which is fine: the site has no server state.
- **Workers, not Pages.** Cloudflare's Pages overview says "Start new projects with Workers" (last updated 2026-08-25), and its best-practices page says to use Workers static assets for new static sites (read 2026-11-06).
- **Deploy by Workers Builds.** A Worker created from the GitHub repository, root directory `apps/web`, build command `pnpm install --frozen-lockfile && pnpm build`, deploy command `npx wrangler deploy`, production branch `main`, watch paths `apps/web/**` and `packages/shared/design-tokens.json`. The operator creates it in the dashboard (C1 in #352); no agent touches the Cloudflare account. Workers Builds reads `packageManager` from the root `package.json` for the pnpm version (build-image docs, read 2026-11-06), so the version stays in one place.
- **Design tokens from one source, in a later PR.** The site will build its CSS from the app's design-token file after that file moves to `packages/shared`, so the brand cannot drift between the two. Copying the colors into the site was rejected for that reason, and so was importing from `apps/mobile`, which would make the web app depend on the mobile app's internals.
- **Fonts are self-hosted.** Loading them from Google's servers would send every visitor's IP address to Google and add a processor to the privacy policy.
- **`apps/dashboard` is a separate app, later.** The CafeOwner dashboard (#352) is authenticated and data-heavy; the landing site is public and static. They stay apart so the auth surface never enters the public site.

## CI: one job, skipped steps

Branch protection on `main` requires the `ci` status context (`gh api repos/git-sparrow/kavtsya/branches/main/protection`, read 2026-11-03). A workflow-level `paths:` filter would leave that context pending forever on a web-only PR, so the workflow keeps its single job `ci` and decides inside it.

`scripts/ci/changed-scope.mjs` lists the changed paths with `git diff --name-only --no-renames HEAD^1` and prints `web` only when every path is under `apps/web/`. Everything else prints `full`: any root file, lockfile, shared package or workflow edit, an empty diff, and any error running git. The filter fails open. `--no-renames` lists both sides of a move, so a file moved out of `apps/web/` still counts. On a `pull_request` run the checkout is the merge commit, so `HEAD^1` is the base (`fetch-depth: 2` is already set); on a push to `main` it is the previous commit.

On `web`, CI skips Expo Doctor and the test step (the API, mobile and script suites). It always runs install, `agents:check`, `deps:check`, typecheck, lint, the format check and the web build. `pnpm verify` runs the same web build locally. A PR that edits `ci.yml` or the root manifests is `full`, so it runs everything.

## Formatting `.astro` files

Prettier has no Astro parser, so `pnpm format:check` skips `.astro` files (run 2026-11-06, Prettier 3.9.10). `prettier-plugin-astro` 1.1.2 (peer `prettier ^3.5.3`) would format them, but the plugin has to be named in `.prettierrc`, which this change's scope did not include. Revisit when pages hold real markup: the change is one devDependency and a `plugins` entry in `.prettierrc`.

## Receipts (all read or run 2026-11-06)

- `npm view astro version peerDependencies engines`: latest 7.4.7, peer `@astrojs/markdown-remark ^7.3.0`, Node `>=22.23.4`. Its `vite` dependency is `^8.3.5` (`npm view astro@7.4.7 dependencies.vite`). The lockfile resolves 7.4.6: 7.4.7 was published 2026-11-05T19:59Z, inside pnpm's default 24-hour `minimumReleaseAge`, and the range `^7.4.5` takes it once it ages in. We add no `minimumReleaseAgeExclude` entry. The repo pins Node `^24.22.1`. The lockfile also resolves `vite` 8.3.6, `wrangler` 4.158.0.
- `npm view wrangler version peerDependencies`: 4.158.0, optional peer `@cloudflare/workers-types ^5.20261104.1`, Node `>=22.0.0`. Static assets `base_path` needs 4.148.0, the 100,000-asset limit 4.34.0; neither is used.
- `npm view prettier-plugin-astro version peerDependencies`: 1.1.2, peer `prettier ^3.5.3`.
- The catalog's `vite` moves from `^8.3.4` to `^8.3.5`, the range Astro requires, so the lockfile holds one Vite. A prototype on 2026-11-03 resolved 8.3.4 and 8.3.5 side by side.
- Cloudflare docs read: Astro on Workers (`developers.cloudflare.com/workers/framework-guides/web-apps/astro/`), Pages get-started (last updated 2026-08-21), Workers Builds configuration, advanced setups (monorepos) and build image.
- Read-only Cloudflare MCP state: zone `kavtsya.com` active on Cloudflare nameservers, no apex address record, `api.kavtsya.com` CNAME unproxied, three MX records, no Workers.
- Expo Doctor stays 20 of 20 with `apps/web` in the workspace (`EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1 npx expo-doctor@1.20.4`, run in this PR).

## Unverified

- Whether Workers Builds installs a pnpm workspace when the root directory is `apps/web`. Cloudflare's monorepo docs say to set the root directory to where the Wrangler config lives and name pnpm workspaces as a use case, but say nothing on how the install resolves the root lockfile; its automatic-configuration page calls workspace support "currently limited". C1 settles it. **If it fails**, the fallback is a deploy job in GitHub Actions with a scoped API token stored as a repository secret, which needs its own decision here.
- Whether non-production branches get preview URLs for review. Both open points need a Cloudflare account change, so no agent can test them.

## Rejected

- **Plain HTML, no build step.** Fewest dependencies, but the same site becomes the landing page and both a shared layout and token-generated CSS need a build.
- **Cloudflare Pages.** Cloudflare tells new projects to use Workers.
- **Next.js or another React framework.** `react-dom` must never enter the tree (`docs/agents/dependency-updates.md`), and static pages need no client JavaScript.
- **A hosted page (Notion, a Google Doc).** No review gate and no history beside the code it describes. It stays the stopgap if the site slips past the first store submission.
- **Separate CI workflows per app.** The required `ci` context would sit pending whenever its workflow did not run.
- **Path filters with `paths:`.** Same reason.
