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
  npx expo run:ios --device --configuration Release
```

`KAVTSYA_NO_PUSH=1` is only for signing with a free Apple team; drop it once a
paid team signs the build.

## Shipping the mobile app

The **maintainer** owns account setup, credentials, remote builds, submissions,
store rollout and physical-device checks. Agents prepare config and commands;
merging a PR does not trigger a mobile release. Run EAS commands in `apps/mobile`
([Expo monorepo guide](https://docs.expo.dev/build-reference/build-with-monorepos/),
read via the `llms.txt` index on 2026-10-14).

### Profiles and versions

[`apps/mobile/eas.json`](../apps/mobile/eas.json) defines `preview` for internal
distribution and `production` for TestFlight/Play (Android AAB). Both bundle
`EXPO_PUBLIC_API_URL=https://api.kavtsya.com`: preview uses real production data
and writes. Preview is not a store build or a staging backend.

Before a new marketed release, change `expo.version` in `app.json` through a PR;
leave it unchanged for replacement builds of that release. EAS owns
`ios.buildNumber` and `android.versionCode` remotely and increments them for
production builds; do not add or hand-bump them in app config. With no existing
remote/local build number, EAS initializes the first build at 1. If builds have
already been uploaded outside EAS, the maintainer first runs
`npx eas-cli@24.13.0 build:version:set` and enters each platform's last uploaded
number. ([Expo versioning](https://docs.expo.dev/build-reference/app-versions/),
read on 2026-10-14: `cli.appVersionSource: remote`, `autoIncrement: true`.)

No EAS development profile is included. `developmentClient: true` requires
`expo-dev-client`, which this app does not declare. Checked on 2026-10-14 against
[EAS profiles](https://docs.expo.dev/build/eas-json/) and the
[SDK 57 DevClient reference](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/).
Any future addition uses `expo install`; SDK 57 governs the native surface.

### Maintainer setup and credentials

Complete H1–H4 in the [#65 validation contract](https://github.com/git-sparrow/kavtsya/issues/65):
the owning Expo account, paid individual Apple team, App Store Connect app for
`com.kavtsya.app`, personal Play account/app, testers, and a physical iPhone plus
a second account/device for scanning. Store contact email is still a maintainer
decision in #1; resolve it before completing store listings.

From the reviewed checkout, after `pnpm install --frozen-lockfile`:

```bash
cd apps/mobile
npx eas-cli@24.13.0 login
npx eas-cli@24.13.0 project:init
npx eas-cli@24.13.0 credentials -p ios
npx eas-cli@24.13.0 credentials -p android
```

Select the owning Expo project and paid Apple team, and EAS-managed credentials.
Review and commit the real project linkage (`extra.eas.projectId` and any
`owner` change) through the release PR before building; do not invent an ID.
For iOS, configure the distribution certificate, provisioning profile, APNs key
and App Store Connect API key. For Android, configure the upload keystore and
Google Service Account key for Play submissions. EAS stores managed credentials
on its servers; Apple/Google accounts and store records stay in their portals.
Keep downloaded keys, service-account JSON and `credentials.json` outside the
checkout. No credentials belong in `eas.json` or PR evidence.

Keep `KAVTSYA_NO_PUSH` **unset** in the maintainer shell, local env files and both
EAS environments. That free-team escape hatch strips the push entitlement.
Check EAS environment variables for conflicting API URLs before building.
EAS CLI 24.13.0 was checked with `npm view eas-cli version peerDependencies deprecated`
on 2026-10-14; commands/flags and remote credential handling were read in the
[EAS CLI reference](https://docs.expo.dev/eas/cli/) and
[eas.json reference](https://docs.expo.dev/eas/json/) that day. No CLI dependency
or Expo-governed package is changed by this release configuration.

### iOS: build, TestFlight, device pass (M3–M6)

The maintainer runs these separately; replace the ID with the successful iOS
production build's ID, so submission cannot accidentally select a preview build:

```bash
unset KAVTSYA_NO_PUSH
npx eas-cli@24.13.0 build -p ios --profile production
npx eas-cli@24.13.0 submit -p ios --profile production --id IOS_BUILD_ID
```

The submit prompt selects the App Store Connect app and credentials. After Apple
processes the upload, add the maintainer as a TestFlight internal tester, complete
any compliance prompts, and install that build on the physical iPhone.
Submission uploads the binary; it does not publish an App Store release.
([Expo iOS submit](https://docs.expo.dev/submit/ios/), read on 2026-10-14 to resolve
#65's unverified TestFlight flow.)

On that TestFlight build, the maintainer:

1. Creates a Customer account and a separate CafeOwner account; the CafeOwner
   registers a Café. Uses the second account/device to display the Customer QR.
2. Opens the scanner with camera permission not yet granted and records the
   Ukrainian permission copy. Scans the QR, verifies a successful Purchase and
   that the Customer balance rises by one Зернятко. Rescans the **same, unexpired**
   QR and verifies duplicate rejection and no second balance increase.
3. Records HTTP `201` then `409` evidence as well as the visible results. If
   response statuses cannot be observed on the release build, records that
   assertion as a gap rather than inferring it from a success/error screen.
4. As the Customer, enables café news consent and OS notifications to register
   the push token. With an eligible Pro Café, sends a test campaign from CafeOwner
   Mode and confirms receipt on this iPhone. If unavailable, records M6 as a gap;
   do not change production Plan data just to pass the check.

Report the build ID/status, paid signing team confirmation, TestFlight version
and build number, device/iOS version, sanitized screenshots or notes for each
step, HTTP evidence and push receipt (or gap) to #65/the PR. This also supplies
#58's physical-device pass. The agent reads no production data; never attach
passwords, cookies, QR tokens, push tokens or customer records.

### Android: build and start the closed test (M7)

The maintainer builds a production AAB, then submits that exact build:

```bash
npx eas-cli@24.13.0 build -p android --profile production
npx eas-cli@24.13.0 submit -p android --profile production --id ANDROID_BUILD_ID
```

The submission profile deliberately uploads to **internal testing as a draft**.
Finish Play Console app setup and listing requirements, then create a **closed
testing** track and select/promote that uploaded bundle into its release. If the
API upload is unavailable, download the AAB from that EAS build and upload it
manually to the closed track. Complete review/rollout, configure the tester list
and distribute the opt-in link. Internal testing and a draft upload do **not**
satisfy M7. Do not substitute `track: beta`: Google's API documents beta as open
testing and custom names for closed tracks.
([Expo Android submit](https://docs.expo.dev/submit/android/),
[submission schema](https://docs.expo.dev/eas/json/),
[Google track names](https://developers.google.com/android-publisher/tracks),
read on 2026-10-14.)

Recruit 15–20 testers and keep at least 12 continuously opted in for 14 days.
After that period, apply for production access; elapsed time alone does not
publish the app. Checked against
[Google's personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
on 2026-10-14. Report the AAB build ID, versionCode, actual closed-track name,
rollout/availability date, and date the qualifying 12-tester continuous opt-in
period began. Record pending review, listing/contact-email or recruitment as a
gap until the closed release is available and the qualifying cohort is opted in.
