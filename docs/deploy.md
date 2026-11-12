# Deploying the API (Railway)

Production runs on Railway in the EU West region (Amsterdam). The desired state
lives in [`.railway/railway.ts`](../.railway/railway.ts) (Railway Infrastructure as Code);
the image is [`apps/api/Dockerfile`](../apps/api/Dockerfile).

| Service | What it does |
|---|---|
| `postgres` | The database |
| `api` | Hono API at `https://api.kavtsya.com`; runs migrations as its pre-deploy step and must pass `/health` before taking traffic |
| `generate-fortunes`, `prune-push-receipts`, `prune-expired-sessions` | Cron jobs on the API image (schedules in UTC, in `.railway/railway.ts`) |
| `database-backup` | Nightly PostgreSQL archive to private R2 storage on its dedicated `ops/backup/Dockerfile` image |

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

Production activation requires every receipt in the maintainer procedure below.
Keep the `database-backup` service unable to run until its public disclosures are
published. Merging the IaC does not apply it.

The `database-backup` service runs daily at **02:00 UTC**. Its dedicated
[`ops/backup/Dockerfile`](../ops/backup/Dockerfile) contains PostgreSQL 18 clients
and Debian's `awscli`, separate from the API image. The job uploads a custom
archive under a unique `postgres/` key after checking its archive inventory,
then verifies the remote size. Single-object uploads are limited to 5 GiB.
A larger database needs a reviewed multipart implementation before reaching
that limit. The job has a 30-minute limit and a 10-second termination grace.
Temporary files have private permissions and are removed on exit or handled
termination. A forced kill depends on Railway disposing of the container.

The snapshot includes personal data and auth records except `session` rows.
Active and expired sessions, including their IP addresses and user agents, are
omitted. Users must sign in again after recovery. Other auth tables are retained.
The snapshot does not provide point-in-time recovery, database roles, or
infrastructure recovery, and can miss changes since the last successful run.
No application-layer `age` encryption is implemented. R2 encrypts data in transit
and at rest. Anyone with object read access can restore the archive.

### Activate backups (maintainer)

1. Check the live database major inside its private-network service. From the
   linked production project, open `railway ssh -s postgres`, then run this in
   the remote shell, with tracing disabled:

   ```bash
   set +x
   PGPASSWORD="$POSTGRES_PASSWORD" psql --host=127.0.0.1 \
     --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-psqlrc \
     --set=ON_ERROR_STOP=1 --command='SHOW server_version;'
   ```

   The password is read from the official image's environment, never passed in
   arguments. Record the server major on #310. The image's preflight refuses a
   different major. Match the client image and isolated restore target to the
   actual major before activation. The production execution receipt is required.
2. Enable R2 in the Cloudflare Dashboard before creating a bucket. A read-only
   account check on 2026-11-12 returned `403`, code `10042`, asking to enable R2.
   Create a **private** bucket, preferably with **EU jurisdiction**. Keep both
   `r2.dev` and custom-domain public access disabled. Create two bucket-scoped
   credentials: **Object Read & Write** for the job and **Object Read-only** for
   archive download and drills. Store them separately. Read & Write also permits
   object deletion, so this is not immutable storage. Keep the job credential
   off the API and other jobs, and the read credential off Railway.
3. Set a lifecycle rule for prefix `postgres/` to expire objects after **30 days**.
   Record the accepted rule and bucket jurisdiction on #310. Lifecycle deletion
   is asynchronous. Thirty days is the expiration setting, not an exact physical
   deletion deadline. No backup script deletes remote objects.
4. Publish the privacy policy and account deletion disclosure at activation,
   before attaching a source or cron schedule to a credentialed backup service.
   Disclose the processor and location, retained contents and session exclusion,
   30-day expiration setting and asynchronous deletion, restricted recovery use,
   and the recovery prerequisites below. Verify both public pages serve that
   wording before continuing. Describe the activation accurately without claiming
   that a production backup or recovery receipt already exists.
5. Bootstrap the service without a source if it does not exist:
   `railway add --service database-backup`. Do not pass `--repo` or `--image`.
   Confirm it has no source or deployment before supplying its preserved variables
   through the Secrets procedure above: `R2_BUCKET`, `R2_ENDPOINT_URL`,
   `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`. Withhold the final secret
   until the disclosures in step 4 are live. Missing configuration makes the job
   exit before connecting to the database. The empty service supplies an existing
   home for `preserve()` values without relying on new-service preservation.
   Use `https://<account-id>.eu.r2.cloudflarestorage.com` for an EU-jurisdiction
   bucket, or the account endpoint without `.eu` for the default jurisdiction.
   Review `railway config plan` for the source, dedicated Dockerfile, database
   reference, region, and cron schedule, then apply the pinned reviewed plan.
   Re-plan until no changes remain. Record the live bootstrap, plan, and apply
   receipts on #310. Scan the actual Railway-built backup image and record the
   image identity and scan result before accepting activation.
6. Trigger a run with `railway cron run --service database-backup`, then inspect
   `railway cron list --service database-backup` and the service logs. Record the
   run, sanitized `backup complete key=... bytes=...` line, private object status
   and size, and lifecycle rule on #310. Download that object with the separate
   read credential and complete the isolated drill below. Record its output and
   schema revision. A local stand-in does not prove R2 authentication, permissions,
   jurisdiction, lifecycle, Railway builds, or scheduling.
7. After the first scheduled run, record a second object and run receipt.
   Assign a daily operator to check by 02:45 UTC for a new verified object and
   successful run, including days with no run. Investigate missing objects,
   nonzero exits, or skipped runs immediately. Railway skips a cron run while
   its preceding run is active, so failed-deploy alerts alone are insufficient.
   Record the assigned operator and a demonstrated missed-run check on #310.

### Verify a downloaded archive

Use a trusted machine with Docker, the AWS CLI, enough private disk space, and
this checkout at the snapshot's schema revision. Keep archives outside the repo.
Run the following in Bash. Enter the separate Object Read-only credentials at
hidden prompts. Set `R2_ENDPOINT_URL`, `R2_BUCKET`, and `BACKUP_KEY` to the
nonsecret endpoint, bucket, and chosen object key before running:

```bash
set +x
umask 077
backup_download_dir=$(mktemp -d)
read -r -s -p 'Read-only Access Key ID: ' AWS_ACCESS_KEY_ID
printf '\n'
read -r -s -p 'Read-only Secret Access Key: ' AWS_SECRET_ACCESS_KEY
printf '\n'
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN
AWS_DEFAULT_REGION=auto AWS_EC2_METADATA_DISABLED=true AWS_PAGER= \
  AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null \
  aws --endpoint-url "$R2_ENDPOINT_URL" s3api get-object \
  --bucket "$R2_BUCKET" --key "$BACKUP_KEY" "$backup_download_dir/database.dump"
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
ARCHIVE_FILE="$backup_download_dir/database.dump" bash scripts/backup/restore-drill.sh
```

Credentials travel in the child environment, never in command arguments. Clear
them if a command is interrupted. The drill constructs a unique PostgreSQL 18
container with no network, host ports, or host mounts. It restores to an empty
database, checks migration inventory, tables, foreign-key validation, ledger
membership, and the ledger's canonical negative-balance query, then removes its
exact container and volume on exit or handled termination. It never accepts a
destination URL. Compare the printed counts with independent expectations from
the snapshot's time. Archive inventory and matching size alone do not prove
recovery. Delete the local archive according to the incident's handling rules.
If forcibly killed, remove only this task's `kavtsya-restore-*` container and volume.

For local verification and CI, run `bash scripts/backup/integration.sh`. It builds
the backup image, runs the app's migration SQL on a disposable database, uploads
synthetic Ukrainian data with the real AWS CLI to a local TLS S3 stand-in, and
restores the uploaded bytes. It checks UTF-8 data, session exclusion, the ledger,
foreign-key enforcement, and sequence state. Every resource has a unique task
name. This command never contacts R2 or a production database.

### Prerequisites for recovery after data loss

Stop application and cron writes before selecting an archive. Identify the lost
time interval and complete the isolated drill, comparing counts and migration
inventory with the incident's expected state. Never overwrite the live database
to test a restore.

A restored snapshot can reintroduce deleted-account data and stale push consent.
No independent deletion or consent journal currently exists. **Keep any recovered
database offline** until an independent deletion and consent recovery design has
been implemented and rehearsed. The omitted auth sessions do not solve that gap.
Track this prerequisite on #310. A complete production recovery procedure also
needs a rehearsed private-network route to restore into a separate database,
recreate roles and secrets, validate the app there, and repoint all services.
These prerequisites must pass before the maintainer can accept traffic or resume
outbound push and AI jobs. The local drill remains useful for archive validation.

Contracts checked against primary docs on **2026-11-12**:
[PostgreSQL custom dumps](https://www.postgresql.org/docs/18/app-pgdump.html),
[libpq connection services](https://www.postgresql.org/docs/18/libpq-pgservice.html),
[libpq environment variables](https://www.postgresql.org/docs/18/libpq-envars.html),
[R2 tokens and jurisdiction endpoints](https://developers.cloudflare.com/r2/api/tokens/),
[R2 lifecycle expiration](https://developers.cloudflare.com/r2/buckets/object-lifecycles/),
[R2 upload limits](https://developers.cloudflare.com/r2/platform/limits/),
[R2 data security](https://developers.cloudflare.com/r2/reference/data-security/),
[the R2 AWS CLI example](https://developers.cloudflare.com/r2/examples/aws/aws-cli/),
[AWS CLI GetObject](https://docs.aws.amazon.com/cli/latest/reference/s3api/get-object.html),
[Railway cron behavior](https://docs.railway.com/cron-jobs),
[Railway empty service creation](https://docs.railway.com/cli/add),
[Railway IaC](https://docs.railway.com/infrastructure-as-code), and the
[official PostgreSQL image environment](https://github.com/docker-library/docs/blob/master/postgres/README.md#environment-variables).
Also checked Railway CLI **5.71.0** help for `add`, `ssh`, and `cron run`, and
installed Railway SDK **3.16.0** README: `preserve()` keeps an existing value.
Those are documentation and command-shape checks. Live bootstrap, database major,
Railway-built image scan, R2 upload and restore, and scheduled-run receipts must
be recorded on #310 before activation can be accepted.

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
