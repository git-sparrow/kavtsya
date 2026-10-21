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
previous version keeps serving.

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

## Backups

Enable the daily schedule on the `postgres` volume (Backups tab). Restores land
only in the same project and environment; wiping the volume deletes its backups.

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
   IP addresses.
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
   `ota_updates.is_embedded_launch` (and, once EAS Update exists,
   `expo.updates.update_id`), and a stack trace whose frames resolve to
   `src/...tsx` lines. Minified frames mean the upload or the Debug ID failed.
4. Check the event for anything the ADR's deny-list withholds. Record the event
   link on #217.

### After an EAS Update

When EAS Update is adopted, upload the update's source maps right after publishing:

```bash
cd apps/mobile
eas update --branch <branch> && npx sentry-expo-upload-sourcemaps dist
```

Put the command in the script that publishes updates; ADR 0019 names what
skipping it costs.
