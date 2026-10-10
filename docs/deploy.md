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

`api.kavtsya.com` can't be registered from the file. Add it once with
`railway domain api.kavtsya.com -s api`, then declare it in `domains`.

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

## Backups

Enable the daily schedule on the `postgres` volume (Backups tab). Restores land
only in the same project and environment; wiping the volume deletes its backups.

## Running the mobile app against production

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=https://api.kavtsya.com KAVTSYA_NO_PUSH=1 \
  npx expo run:ios --device --configuration Release
```

`KAVTSYA_NO_PUSH=1` is only for signing with a free Apple team; drop it once a
paid team signs the build.
