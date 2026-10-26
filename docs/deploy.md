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
`npx eas-cli@25.3.0 build:version:set` and enters each platform's last uploaded
number. ([Expo versioning](https://docs.expo.dev/build-reference/app-versions/),
read on 2026-10-14: `cli.appVersionSource: remote`, `autoIncrement: true`.)

No EAS development profile is included. `developmentClient: true` requires
`expo-dev-client`, which this app does not declare. Checked on 2026-10-14 against
[EAS profiles](https://docs.expo.dev/build/eas-json/) and the
[SDK 57 DevClient reference](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/).

### Maintainer setup and credentials

Before building, the maintainer needs an owning Expo account, a paid individual
Apple Developer team and App Store Connect app record for `com.kavtsya.app`, and
a personal Google Play developer account with an app record and the internal
testers' Google account emails (the closed test later needs at least 12). Device checks below use the maintainer’s physical iPhone, a second
physical iPhone, and separate Customer and CafeOwner accounts. Resolve the store
contact mailbox before completing store listings.

From the reviewed checkout, after `pnpm install --frozen-lockfile`:

```bash
cd apps/mobile
npx eas-cli@25.3.0 login
npx eas-cli@25.3.0 credentials -p ios
npx eas-cli@25.3.0 credentials -p android
```

The Expo project is linked by `extra.eas.projectId` and `owner` in `app.json`.
Select the paid Apple team and EAS-managed credentials. For iOS, configure the distribution certificate, provisioning profile, APNs key
and App Store Connect API key. For Android, configure the upload keystore and
Google Service Account key for Play submissions. EAS stores managed credentials
on its servers; Apple/Google accounts and store records stay in their portals.
Keep downloaded keys, service-account JSON and `credentials.json` outside the
checkout. No credentials belong in `eas.json` or PR evidence.

Keep `KAVTSYA_NO_PUSH` **unset** in the maintainer shell, local env files and both
EAS environments. That free-team escape hatch strips the push entitlement.
Check EAS environment variables for conflicting API URLs before building.

Finish [Crash reporting (Sentry) › One-time setup](#one-time-setup-maintainer)
before the first `preview` or `production` build: both profiles read their
EAS environment, and without `SENTRY_AUTH_TOKEN` an iOS build fails at the
source-map upload (Android's behaviour is unverified, ADR 0019). The first
tester build's log is step 1 of "Prove it before trusting it"; the steps that
crash the app on purpose need their own builds.

EAS CLI 25.3.0 was checked with `npm view eas-cli version deprecated engines`
on 2026-10-24 (not deprecated; Node `>=22`), and each command below with its
`--help` that day. Remote credential handling was read in the
[EAS CLI reference](https://docs.expo.dev/eas/cli/) and
[eas.json reference](https://docs.expo.dev/eas/json/) on 2026-10-14.

### Preview: internal distribution

The maintainer runs these from `apps/mobile` after the account/credential setup
above. For iOS, first register each intended device with `device:create`, then
select those devices when building so the ad hoc provisioning profile includes
them. Install using the finished build’s EAS link. Android internal builds
produce an APK; install it from its EAS link on the intended Android device.

```bash
npx eas-cli@25.3.0 device:create
npx eas-cli@25.3.0 build -p ios --profile preview
npx eas-cli@25.3.0 build -p android --profile preview
```

Only devices included in the iOS ad hoc profile can install that build; adding a
device requires a rebuild or re-sign. Checked via the `llms.txt` index and
[Expo internal distribution](https://docs.expo.dev/build/internal-distribution/)
on 2026-10-14. These previews still access the production API.

### iOS: build, TestFlight, device pass

The maintainer runs these separately; replace the ID with the successful iOS
production build's ID, so submission cannot accidentally select a preview build:

```bash
unset KAVTSYA_NO_PUSH
npx eas-cli@25.3.0 build -p ios --profile production
npx eas-cli@25.3.0 submit -p ios --profile production --id IOS_BUILD_ID
```

`submit.production.ios.ascAppId` in `eas.json` names the App Store Connect app,
created by hand so its primary language and SKU are chosen rather than defaulted;
the submit prompt only selects credentials. `ios.config.usesNonExemptEncryption:
false` in `app.json` is the maintainer's export-compliance answer (standard HTTPS
and the iOS Keychain only), so builds skip that prompt; revisit it before adding
any other encryption. After Apple processes the upload, add the maintainer as a
TestFlight internal tester and install that build on the physical iPhone.
Submission uploads the binary; it does not publish an App Store release.
([Expo iOS submit](https://docs.expo.dev/submit/ios/), read on 2026-10-14.)

For the device pass, the maintainer operates both their iPhone **A** and the
second iPhone **B**. Install the same production TestFlight build on both phones.
The Apple ID used for TestFlight on B must be an App Store Connect user on the
team with access to this app, invited to its internal testing group. Both
phones run against production; the Customer QR is a live, rotating token.

If someone else operates B, add their Apple ID as an App Store Connect user with
app access for internal testing, or distribute through an external testing group,
which requires TestFlight Beta App Review. These tester requirements were checked
against [Apple internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/)
and [external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/)
on 2026-10-14.

Decide the push-check path before starting. Steps 4–8 send campaigns, which
need three things; without all of them, record the push check as a gap up front
and skip steps 4–8:

- **Explicit maintainer approval of a deliberate production Plan change** for the
  test Café created in step 1. A campaign needs a Pro Café, new Cafés start
  Free, and in v1 only the Platform changes a Plan, by hand in the database.
- The production API is deployed from a `main` that includes #350 (sign-out
  releases the device's push token). GitHub records each production deploy's
  commit: `gh api repos/git-sparrow/kavtsya/deployments --jq '.[0].sha'`.
- The TestFlight build on A includes #350.

Keep that Café dedicated to the test accounts: a campaign reaches **all** its
recently active, consenting Customers with active device tokens, and consumes
its campaign allowance. Never send this test from any other live Café.

After step 1 and before step 5, the maintainer makes the Plan change with
`railway connect postgres` (needs `psql` installed locally; unverified), finding
the Café by its CafeOwner's email:

```sql
select c.id, c.name, c.plan from cafes c
  join "user" u on u.id = c.owner_user_id where u.email = '<CafeOwner email>';
update cafes set plan = 'pro' where id = '<that id>';
```

When the test Café no longer needs campaigns, revert it with
`update cafes set plan = 'free' where id = '<that id>';`.

The maintainer performs these steps:

1. On **A**, create/sign in to the **CafeOwner** account and register a Café.
   On **B**, create a new, separate **Customer** account and display its live QR.
   Leave café news consent off and do not grant notification permission on **B**.
   Record the Customer’s starting balance on B.
2. On **A as CafeOwner**, open the scanner with camera permission not yet granted
   and record the Ukrainian permission copy. Scan B’s Customer QR and verify a
   successful Purchase; on **B as Customer**, verify the balance rises by one
   Зернятко. On **A as CafeOwner**, rescan the **same, unexpired** QR and verify
   duplicate rejection; on **B as Customer**, verify no second balance increase.
   When the café-news consent card appears on **B** after the first Purchase,
   decline it. This leaves account-level consent off; step 4 enables it on A.
3. Record HTTP `201` then `409` evidence for A’s scan requests as well as the
   visible results. A release build shows no status, so read Railway's HTTP
   logs for the minutes of the scans and record only time, method, path and
   status (the lines also carry IP addresses and user agents):

   ```bash
   railway logs --http -s api --since <ISO start> --until <ISO end> \
     --filter '@path:/api/purchases'
   ```

   Flags checked with `railway logs --help` (CLI 5.71.0, 2026-10-26); the
   output is unverified. If the logs no longer cover the scans, record the
   assertion as a gap rather than inferring it from screens.
4. For the push check, **sign out on both phones**. On **A**, sign in to the same
   **Customer** account used on B for the scan. On **B**, sign in to the
   **CafeOwner** account used on A. On **A as Customer**, enable café news consent
   and OS notifications; push-token registration must happen on **A**, the
   intended receiving device.
5. On **A**, leave the app (Home screen or lock): the app shows no notification
   that arrives while it is open. On **B as CafeOwner**, send one test campaign
   from the **same test Café created in step 1**, where the Customer earned
   their Purchase. Confirm the notification arrives on **A**.
6. Each send in steps 7–8 is the test Café's first of that Business day: the
   campaign cap is per Café per Business day, so these run on consecutive days.
   Record the result line the campaign screen shows after each send; a release
   build shows no HTTP status.
   **Day N**, after the step-5 send: on **A as Customer**, online and with café
   news on, tap «Вийти» in Settings.
7. **Day N+1:** on **B as CafeOwner**, send from «Розсилка». Expect «Поки нема
   кому…» (0 recipients), and nothing arrives on **A**.
8. On **A**, sign back in as the same Customer, **without opening Settings**,
   then leave the app. **Day N+2:** on **B**, send again. Expect «Отримають 1
   твоїх клієнтів», and the notification arrives on **A**.

Record the build ID/status, paid signing team confirmation, TestFlight version
and build number, both device/iOS versions, sanitized screenshots or notes for
each step, HTTP evidence, A’s push receipt (or gap) and the step 6–8 result lines
in the release handoff.
The agent reads no production data; never attach passwords, cookies, QR tokens,
push tokens or customer records.

### Android: build and internal testing

The maintainer builds a production AAB, then submits that exact build:

```bash
npx eas-cli@25.3.0 build -p android --profile production
npx eas-cli@25.3.0 submit -p android --profile production --id ANDROID_BUILD_ID
```

The submission profile uploads to **internal testing as a draft**; the first
submission creates the app's first internal-testing release. Internal testing
can start before the store listing and app setup are complete; promoting to
production cannot. In Play Console, create a tester email list (internal testing allows up to 100
testers per app), select it on the internal test's Testers tab, roll out the
draft release and send testers the test link. Internal testers cannot find the
app by searching Google Play. After the first publish of any test type, the link
can take several hours to reach testers; later bundles arrive within minutes.
([Expo Android submit](https://docs.expo.dev/submit/android/) and
[Google internal testing](https://support.google.com/googleplay/android-developer/answer/9845334),
read on 2026-10-20.)

Report the AAB build ID, versionCode, the internal release's rollout date, and
one tester device (model and Android version) that installed the build from the
test link and signed in. Record pending Play Console setup as a gap.

### Android: closed test before the public release

Not part of the internal-testing pass. A personal Play developer account needs a
closed test before it can apply for production access, so start it early enough
for the public release date. From the uploaded bundle, create a **closed
testing** track and select or promote that bundle into its release. If the API
upload is unavailable, download the AAB from that EAS build and upload it
manually to the closed track. Complete review/rollout, configure the tester list
and distribute the opt-in link. The qualifying closed-test period begins only
after the closed release is available and the tester cohort is opted in.
Do not substitute `track: beta`: Google's API documents beta as open
testing and custom names for closed tracks.
([Expo Android submit](https://docs.expo.dev/submit/android/),
[submission schema](https://docs.expo.dev/eas/json/),
[Google track names](https://developers.google.com/android-publisher/tracks),
read on 2026-10-14.)

Keep at least 12 testers continuously opted in for 14 days; recruit a few more
to absorb drop-outs.
After that period, apply for production access; elapsed time alone does not
publish the app. Checked against
[Google's personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
on 2026-10-14. Report the AAB build ID, versionCode, actual closed-track name,
rollout/availability date, and date the qualifying 12-tester continuous opt-in
period began. Record pending review, listing/contact-email or recruitment as a
gap until the closed release is available and the qualifying cohort is opted in.
