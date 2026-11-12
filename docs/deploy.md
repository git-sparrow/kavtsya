# Deploying the API (Railway)

Production runs on Railway in the EU West region (Amsterdam). The desired state
lives in [`.railway/railway.ts`](../.railway/railway.ts) (Railway Infrastructure as Code);
the image is [`apps/api/Dockerfile`](../apps/api/Dockerfile).

| Service | What it does |
|---|---|
| `postgres` | The database |
| `api` | Hono API at `https://api.kavtsya.com`; runs migrations as its pre-deploy step and must pass `/health` before taking traffic |
| `generate-fortunes`, `prune-push-receipts`, `prune-expired-sessions` | Cron jobs on the same image (schedules in UTC, in `.railway/railway.ts`) |

## Shipping code

Merge to `main`. Railway rebuilds the services whose watch paths changed, once
the commit's GitHub checks pass. A failing migration stops the deploy and the
previous version keeps serving. A failed deploy opens a `railway-deploy` issue
for its service, which closes on the next successful deploy.

Each build applies Debian's current security updates, so two builds of one
commit can differ. Scan the image Railway built, not a local one: check the
packages a scan flagged with `railway ssh -s api -- dpkg-query -W <package>`.

## Changing infrastructure

Edit `.railway/railway.ts`, then from the repo root:

```bash
railway config plan    # read-only diff against the linked environment
railway config apply   # applies after confirmation
```

Railway doesn't read `.railway/` during deploys — an edit takes effect only
when applied. Never change service settings in the dashboard; the next apply
reverts them.

Re-run `railway config plan` after every apply until it reports no changes:
on 2026-10-10 the first apply created the database in the default region
(US East) despite `region`, and skipped `checkSuites` on new services; a second
apply fixed both. For an apply that needs confirmation, pin the reviewed plan:

```bash
railway config plan --out plan.json
railway config apply --plan plan.json
```

A custom domain can't be declared until it exists. Attach a new one only after
the API passes its security review, and don't publish it or point a build at it
before then. Create it with `railway domain <API_DOMAIN> -s api --port <API_PORT>`
(both values from the file), add the DNS records it prints (see DNS below), then
declare it in `domains`. To take it down, run
`railway domain delete <API_DOMAIN> -s api`, remove it from `domains`, and
delete its Cloudflare records. (Checked on 2026-10-12 with Railway CLI 5.64.2:
`--help` for both commands, and `config plan` reported no changes once the live
domain was declared.)

## Secrets

Secrets are set once with the CLI and stay on Railway; the IaC file only marks
them `preserve()`. `--stdin` keeps values out of shell history:

```bash
openssl rand -base64 32 | railway variable set BETTER_AUTH_SECRET --stdin -s api
openssl rand -base64 32 | railway variable set QR_TOKEN_SECRET --stdin -s api
railway variable set ANTHROPIC_API_KEY --stdin -s generate-fortunes  # paste, then Ctrl-D
```

Rotating `BETTER_AUTH_SECRET` signs everyone out; rotating `QR_TOKEN_SECRET`
invalidates QR codes for at most one TTL.

## DNS

`api.kavtsya.com` is a CNAME in Cloudflare to the target Railway shows for the
custom domain, set to **DNS only** (grey cloud). Proxying it through Cloudflare
would replace the client IP that Railway passes in `X-Real-IP`, and the auth
rate limiter would see Cloudflare's addresses instead of users.
Keep the `_railway-verify.api` TXT record Railway prints alongside it; the
certificate isn't issued until it resolves (observed 2026-10-12).

Mail for `kavtsya.com` arrives through Cloudflare Email Routing: `hello@` and
`social@` forward to the project Gmail account, which is never published.
Keep the three `route*.mx.cloudflare.net` MX records, the SPF TXT and the
`cf2024-1._domainkey` DKIM record.

Agents read the account through the Cloudflare MCP server (the `cloudflare`
plugin in `.claude/settings.json`). The maintainer signs it in with read-only
scopes: on 2026-11-04 it listed the zone's DNS records, the routing rules and
the Workers, and a no-op DNS `PATCH` came back `403`. Every change to the
account (DNS, routing, Workers, deploys) is the maintainer's to approve and
run.

## Website (Cloudflare Workers)

The public pages for the app stores
([ADR 0020](adr/0020-web-astro-on-cloudflare-workers.md)) are a static Astro
build in [`apps/web`](../apps/web), served by the Worker `kavtsya-web` at
`https://kavtsya.com`. The URLs to enter in the store consoles (#65):

| Store field | URL |
|---|---|
| Privacy policy | `https://kavtsya.com/privacy/` |
| Account deletion | `https://kavtsya.com/delete-account/` |
| Support | `https://kavtsya.com/support/` |

Workers Builds deploys from `main` (root directory `apps/web`, production
branch `main`). It runs `pnpm install --frozen-lockfile && pnpm build`, then
`npx wrangler deploy`, and installs the whole workspace. A merge is the release
only while the GitHub integration delivers push events to Workers Builds (see
#407). After a site change, check that the Worker's
**Builds** tab lists a run for the merge commit and that
`curl -s https://kavtsya.com/privacy/` serves the new page. If no run appears,
start a build by hand from the **Builds** tab.

[`apps/web/wrangler.jsonc`](../apps/web/wrangler.jsonc) is the config. Its
`routes` entry makes `kavtsya.com` a Worker Custom Domain. `wrangler deploy`
attaches it, and Cloudflare creates the proxied DNS record and the certificate.
Never add an `A`, `AAAA` or `CNAME` record for the apex by hand. Cloudflare's
docs say a Custom Domain can't be created on a hostname that already has a
`CNAME`. In a non-interactive run such as Workers Builds, Wrangler sends
`override_existing_dns_record: true` instead of prompting, so another existing
apex record may be replaced without warning (unverified against the API). The
apex coexists with the MX, SPF and DKIM records above, and nothing here touches
`api.kavtsya.com`, which stays DNS only.

`workers_dev` and `preview_urls` stay on, written out so Wrangler stops warning
about the defaults. Wrangler 4.158.0 defaults `workers_dev` to false once a
`routes` entry exists, so `workers_dev: true` is what keeps
`kavtsya-web.olek-horob.workers.dev` alive. That address serves the same files,
which is the way to check a build when the apex fails. The pages hold no
per-user data, so a second hostname leaks nothing. Turn both off only if search
engines start listing the duplicate address.

To roll back a bad release, open the Worker's **Deployments** tab and roll back
to the previous version, or run `npx wrangler rollback`. To take the apex down,
delete the Custom Domain in the Worker's dashboard settings. Removing the
`routes` entry from the config does not detach it, because Wrangler 4.158.0
calls the Custom Domains API only when the config lists at least one custom
domain (`publishCustomDomains`, which runs only when
`customDomainsOnly.length > 0`). The Advanced Certificate it created stays until
deleted under SSL/TLS.
(Checked on 2026-11-07 against Cloudflare's Custom Domains, Workers Builds
configuration, Rollbacks and Version URLs pages, and against
`getSubdomainValues`, `publishCustomDomains` and the `isTTY` branch in
`apps/web/node_modules/wrangler/wrangler-dist/cli.js`, Wrangler 4.158.0.)

## Backups

Backups are **not activated or proven against production**. #310 remains open
until the maintainer records the production upload and restore receipts below.
On Railway Hobby, the `postgres` service's Backups tab says "Upgrade to Pro to
create new backups" (maintainer, 2026-11-07).

The proposed `database-backup` service runs daily at **02:00 UTC**. Its dedicated
[`ops/backup/Dockerfile`](../ops/backup/Dockerfile) contains PostgreSQL 18 clients
and Debian's `awscli`, separate from the API image. It creates one complete
custom archive, checks its archive inventory, uploads a unique UTC/random key
under `postgres/`, then compares the remote object's size with the local file.
A failed stage exits nonzero without printing database or S3 stderr. The whole
job has a 30-minute limit, with a 10-second termination grace period. Temporary
files have private permissions and are removed on exit or handled termination.
A host crash or forced kill still depends on Railway disposing of the container.
Single-object uploads are limited to 5 GiB; a larger database needs a reviewed
multipart implementation before this limit is reached.

This is a daily logical snapshot of one database, including auth records and
personal data. It does not provide point-in-time recovery, database roles, or
infrastructure recovery. A snapshot can miss changes since the last successful
run. No application-layer `age` encryption is implemented. R2 access controls
and transport/storage encryption protect the archive; anyone with object read
access can restore its contents.

### Activate backups (maintainer)

1. Run `SHOW server_version;` against the live database and record its major on
   #310. The image uses major 18; its preflight refuses a different server major.
   Match the client image and disposable restore target to the actual server
   major before activation if needed.
2. Create a **private** R2 bucket, preferably with **EU jurisdiction**. Keep both
   `r2.dev` and custom-domain public access disabled. Create a bucket-scoped
   **Object Read & Write** token and save its Access Key ID and Secret Access
   Key securely. This permission also permits deleting objects; it is not
   write-only or immutable storage. Keep the token off the API and other jobs.
3. Set a lifecycle rule for prefix `postgres/` to expire objects after **30 days**.
   Record the accepted rule and bucket jurisdiction on #310. Lifecycle deletion
   is asynchronous, so 30 days is the expiration setting, not an exact physical
   deletion deadline. No backup script deletes remote objects.
4. Review `railway config plan` for the new service before applying the IaC.
   Set its preserved variables through the Secrets procedure above:
   `R2_BUCKET`, `R2_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, and
   `AWS_SECRET_ACCESS_KEY`. `DATABASE_URL` references the database service.
   Use `https://<32-character-account-id>.eu.r2.cloudflarestorage.com` for an EU
   jurisdiction bucket, or the default account endpoint without `.eu` for a
   default-jurisdiction bucket. No path, credentials, port, or query is accepted
   in the endpoint. The database URL accepts a single-host PostgreSQL URI with
   percent-encoded components and libpq query options, including `sslmode`.
   Newlines, NUL, surrounding whitespace in decoded values, and service-file
   indirection are rejected.
5. Before the first production dump, update both the privacy policy and account
   deletion page to disclose the backup processor/location, archive contents,
   30-day expiration setting and asynchronous deletion, restricted recovery
   use, and what happens to deleted-account data after a restore. Do not claim
   this retention is active before the service and lifecycle rule are enabled.
6. Run the job once. Record the Railway deployment/run, sanitized
   `backup complete key=... bytes=...` line, R2 object's private status and size,
   and lifecycle rule on #310. Download that object using a separate read
   credential and run the isolated drill below. Record the restore output and
   schema revision. CI's local stand-in does not prove R2 authentication,
   permissions, jurisdiction, lifecycle, or Railway scheduling.
7. After the first scheduled run, record a second object and run receipt.
   Assign a daily operator to check by 02:45 UTC for a new verified object and a
   successful run, including days with no run. Investigate a missing object,
   nonzero exit, or skipped run immediately. Railway skips the next cron when
   the preceding run is still active, so failed-deploy alerts alone are
   insufficient. Keep #310 open until this operational check is assigned and
   demonstrated. Once activated, update this status and the production receipts.

### Verify a downloaded archive

Use a trusted machine with Docker, enough disk space, and this checkout at the
snapshot's schema revision. Download to a private directory without putting
credentials in shell arguments. Keep the archive out of the repository.

```bash
umask 077
ARCHIVE_FILE=/private/path/database.dump bash scripts/backup/restore-drill.sh
```

The drill constructs a unique PostgreSQL 18 container with no network, host
ports, or host mounts. It accepts only `ARCHIVE_FILE`, restores into an empty
database with `--no-owner --no-privileges --single-transaction`, checks the
migration inventory, tables, foreign-key validation, ledger membership, and
nonnegative derived balances, then removes its exact container and volume on
success, failure, or handled termination. It never accepts a destination URL.
Compare the printed counts with independent expectations from the snapshot's
time. Archive inspection and matching byte counts alone do not prove recovery.
Delete the local archive after the drill according to the incident's handling
requirements. If the host or script is forcibly killed, remove only the printed
`kavtsya-restore-*` container and its volume after confirming its task ownership.

For local verification and CI, run `bash scripts/backup/integration.sh`. It builds
the backup image, applies the real app migrations to a disposable database,
uploads synthetic Ukrainian data with the real AWS CLI to a local TLS S3
stand-in, and restores the uploaded bytes. It checks UTF-8 data, the ledger,
foreign-key enforcement, and sequence state. Every resource has a unique task
name. This command never contacts R2 or a production database.

### Recover service after data loss

1. Stop application and cron writes. Identify the last successful snapshot and
   the lost time interval before choosing an archive.
2. Download the chosen private object and complete the isolated drill. Compare
   its counts and migration inventory with the incident's expected state.
3. Provision a separate database through the normal infrastructure procedure.
   Restore there with the same `pg_restore` flags and validate the app against
   that replacement. Recreate roles and connection secrets separately. Never
   test a restore by overwriting the live database.
4. Reconcile account deletions and consent changes made after the snapshot
   using independent incident/support records. A restore can reintroduce old
   auth sessions, deleted-account data, and push consent. Revoke restored auth
   sessions and keep outbound push/AI jobs stopped until reconciliation passes.
   If those independent records are unavailable, keep the replacement offline
   and resolve the privacy/data-integrity gap before accepting traffic.
5. Switch the application and jobs only after the maintainer accepts the
   validated replacement and the lost-data interval. Check health and the
   loyalty loop, then resume writes and scheduled jobs. Record the incident,
   archive key, checks, and deletion reconciliation without personal data.

Contracts checked against primary docs on **2026-11-12**:
[PostgreSQL custom dumps](https://www.postgresql.org/docs/18/app-pgdump.html),
[libpq connection services](https://www.postgresql.org/docs/18/libpq-pgservice.html),
[R2 tokens and jurisdiction endpoints](https://developers.cloudflare.com/r2/api/tokens/),
[R2 lifecycle expiration](https://developers.cloudflare.com/r2/buckets/object-lifecycles/),
[the R2 AWS CLI example](https://developers.cloudflare.com/r2/examples/aws/aws-cli/),
and the [official PostgreSQL image tags](https://github.com/docker-library/official-images/blob/master/library/postgres).
Production configuration and recovery remain unverified until the receipts above
exist.

## Running the mobile app against production

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=https://api.kavtsya.com KAVTSYA_NO_PUSH=1 \
  SENTRY_DISABLE_AUTO_UPLOAD=true \
  npx expo run:ios --device --configuration Release
```

`KAVTSYA_NO_PUSH=1` is only for signing with a free Apple team; drop it once a
paid team signs the build. `SENTRY_DISABLE_AUTO_UPLOAD=true` skips the source-map
upload, without which a Release build fails when `SENTRY_AUTH_TOKEN` is unset;
such a build sends no crash reports anyway, having no DSN.

## Crash reporting (Sentry)

Decision and deny-list: [ADR 0019](adr/0019-crash-reporting-sentry.md). The app
reports only when its build has `EXPO_PUBLIC_SENTRY_DSN`.

### One-time setup (maintainer)

1. Create the Sentry organization with **Data Storage Location: EU (Frankfurt)**.
   This cannot be changed later.
2. Create one React Native project. Under Project Settings → Security & Privacy,
   keep data scrubbing on (the default) and turn on the setting that stops storing
   IP addresses. Under **Advanced Data Scrubbing**, add these rules, each
   `[Replace]` with the placeholder `[redacted]`, from the source
   `$error.value || $message || $breadcrumb.message || $breadcrumb.data.*`.
   Free text only, never `$string`: that would also rewrite the update id,
   release and Debug IDs that identify and symbolicate a report. They are the
   only scrubbing a native crash's own text gets (ADR 0019), and they mirror
   `SECRETS` in `apps/mobile/src/lib/crash-report-privacy.ts`, so change both
   together:

   | Data type | Regex (Rust dialect) |
   |---|---|
   | Email Addresses | |
   | IP Addresses | |
   | Regex Matches | `(?i)(?:[a-z][a-z0-9+.-]*://\|/)[^\s?#]*[?#]\S*` |
   | Regex Matches | `(?i)\bBearer\s+\S+` |
   | Regex Matches | `(?i)\b(?:session_token\|token\|cookie\|authorization)["']?\s*[:=]\s*["']?[^\s"',;&]+` |
   | Regex Matches | `Expo(?:nent)?PushToken\[[^\]]*\]` |
   | Regex Matches | `[A-Za-z0-9_-]{16,}(?:\.[A-Za-z0-9_-]{16,})+` |
   | Regex Matches | `[A-Za-z0-9_-]{32,}` |
   | Regex Matches | `\b[0-9A-HJKMNP-TV-Z]{4}[\s-]?[0-9A-HJKMNP-TV-Z]{4}\b` |

   The `\|` in the table is Markdown escaping: type a plain `|`.
3. Create an **Organization Auth Token**. It carries the organization and its
   region's URL, which sentry-cli uses over any configured one (`src/config.rs`,
   sentry-cli, read 2026-10-21), so the build needs no URL or org slug.
4. In each EAS environment that builds for testers (`preview`, `production`), set:

   | Variable | Visibility | Value |
   |---|---|---|
   | `EXPO_PUBLIC_SENTRY_DSN` | plain text | the project's DSN |
   | `SENTRY_AUTH_TOKEN` | secret | the Organization Auth Token |
   | `SENTRY_PROJECT` | plain text | the project slug |

   Never commit the token.

### Prove it before trusting it

Before the pilot, and again after any change to the Sentry setup (why: ADR 0019):

1. Build with EAS for a tester profile and confirm the build log shows the source
   maps and debug symbols uploaded.
2. Install it and trigger a render error on purpose, for example a temporary
   `throw` in a screen behind a test-only path. Do not ship that change.
3. In Sentry, the event must show `release` `com.kavtsya.app@<version>+<build>`,
   `ota_updates.is_enabled: false` (once EAS Update exists:
   `ota_updates.is_embedded_launch` and `expo.updates.update_id`), and a stack
   trace whose frames resolve to
   `src/...tsx` lines. Minified frames mean the upload or the Debug ID failed.
4. Check the event for anything the ADR's deny-list withholds.
5. Replace the throw with a temporary `Sentry.nativeCrash()` in
   `crash-reporting.ts` (the only file allowed to import the SDK), rebuild,
   trigger it, and relaunch the app: the native crash must arrive with a
   symbolicated native stack. Do not ship that change either.
6. Check that Sentry applies the server-side rules to a native-shaped event (a
   test checks only the patterns). `apps/mobile/test/fixtures/sentry-native-probe.json`
   is an iOS (`cocoa`) crash event that skips the app's deny-list, with a value
   for every rule planted in its exception, message and breadcrumb:

   ```bash
   cd apps/mobile
   SENTRY_DSN=<the DSN> npx sentry-cli send-event test/fixtures/sentry-native-probe.json
   ```

   In Sentry, every planted value must read `[redacted]`, and the
   `ota_updates.update_id` context must be unchanged. sentry-cli also attaches
   the sending computer's host name and OS; delete the event once checked.

   Then open step 5's native crash and check that its release, Debug IDs and
   (once EAS Update exists) the `ota_updates` context's `update_id` arrived
   intact; native crashes carry the context, not the `expo.updates.*` tags.

7. Record the event links on #217.

### After an EAS Update

When EAS Update is adopted, upload the update's source maps right after publishing.
The uploader runs locally, where the EAS secret is unreadable, and it needs the org
and project spelled out (it exits otherwise; `cli.js`, 8.31.0). Keep them in
`apps/mobile/.env.sentry-build-plugin`, which `.env.*` keeps out of git:

```sh
SENTRY_AUTH_TOKEN=<an Organization Auth Token>
SENTRY_ORG=<org slug>
SENTRY_PROJECT=<project slug>
```

Publish with the environment whose DSN the update must carry; without
`--environment`, it gets none of that environment's variables:

```bash
cd apps/mobile
eas update --branch <branch> --environment production \
  && npx sentry-expo-upload-sourcemaps dist
```

Put the command in the script that publishes updates; ADR 0019 names what
skipping it costs.
