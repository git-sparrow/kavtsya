# Crash reporting goes to Sentry's EU region, through one seam and a tested deny-list

Decided 2026-10-21 (#217). Since #216 every route shows a designed card when rendering it throws. That is better for the Customer and worse for us: a tidy card gets reported far less often than a dead app, so without crash reporting we never learn that it happened. The first pilot puts the app on devices we cannot reach, so we need the reports before then. This is a third-party vendor receiving data derived from real users' sessions, so the security floor decides it ahead of convenience (AGENTS.md).

## Decision

**The mobile app reports crashes to Sentry (`@sentry/react-native` 8.31.0), in an organization created in Sentry's EU region (Frankfurt). Reports leave the app only through `apps/mobile/src/lib/crash-reporting.ts`, and each one passes the deny-list in `crash-report-privacy.ts` first.** A build without `EXPO_PUBLIC_SENTRY_DSN` starts nothing, so local development and tests never send anything.

- **One seam.** `initCrashReporting()` runs first in the root layout. `reportRenderError()` is what every route's error boundary calls (#216). No other file imports the SDK; an ESLint `no-restricted-imports` rule fails the build if one does (type-only imports excepted). Swapping vendors therefore touches one file, as with the AI provider (ADR 0007).
- **What is reported.** Uncaught JS errors and unhandled promise rejections (the SDK's own handlers), render errors caught by a boundary (through the seam), and native crashes. React Native passes a caught render error to `ExceptionsManager`, which the SDK does not hook (`react-native@0.86.3` `src/private/renderer/errorhandling/ErrorHandlers.js`; `@sentry/react-native@8.31.0` hooks neither, both read 2026-10-21), so the seam call is what reports it, and only once.
- **What is not reported.** Handled failures. A read that `useApiResource` turns into a StatusStrip (#53, #190) is expected on a metro dead spot, not a defect. Reporting it would bury real crashes. Nothing in the app calls the seam outside a boundary, and failed-HTTP capture stays off.
- **Errors only.** Tracing, profiling, Session Replay, screenshots, view hierarchy, logs and user feedback stay off. The root component is not wrapped in `Sentry.wrap`, so touch breadcrumbs, which record the labels of what was tapped, never exist.

## The deny-list

Scrubbing happens on the device, before anything is sent. Sentry's server-side scrubbing is a backstop, not the guarantee.

| Withheld | How |
| --- | --- |
| Request URL query, headers, cookies and bodies | `event.request` is dropped; HTTP breadcrumbs keep method, status and path only |
| Emails, usernames, IP addresses | `sendDefaultPii: false`; `event.user` is cut to the SDK's opaque id |
| QR tokens (ADR 0006), JWT-shaped tokens, `Bearer` credentials, Expo push tokens, member codes (raw and `XXXX-XXXX`), URL query strings | Redacted from exception values, event messages and breadcrumb messages |
| Anything logged to the console | Console breadcrumbs are dropped whole |
| Native HTTP breadcrumbs (iOS) | `enableNetworkBreadcrumbs: false`, so iOS records no request breadcrumbs of its own, which `beforeBreadcrumb` could not see |
| Other breadcrumbs' `data` | Dropped; only category and redacted message remain |

**Native crashes.** `beforeSend` runs on JavaScript events only. The native SDKs install their own `beforeSend` (`ios/RNSentry.mm`, `android/.../RNSentryStart.java`, 8.31.0), and nothing set from JS reaches it. A native crash report does carry the JS scope's breadcrumbs, and the SDK forwards a breadcrumb to native only after `beforeBreadcrumb` has run (`@sentry/core@10.76.2` `breadcrumbs.js`; the patched `scope.addBreadcrumb` in `scopeSync.js`). So the breadcrumb rules cover native reports too. What the native SDK adds itself is device, OS and app context, plus the crash's own stack.

`test/crash-report-privacy.test.ts` pins every row. Adding a field that may carry personal data means adding a row here and a case there.

## Symbolication and release identity

- **Release** is `<bundle id>@<version>+<build>` and **dist** is the build number. The SDK reads both from the native build (`dist/js/integrations/release.js`). It is the same identity the build uploads its source maps under, so we do not override it.
- **EAS Build** uploads source maps and debug symbols through the config plugin's Xcode and Gradle phases when `SENTRY_AUTH_TOKEN` is in the build environment. A release build without a token **fails** unless `SENTRY_DISABLE_AUTO_UPLOAD=true` (`scripts/sentry-xcode.sh`). That is deliberate: no store build ships silently unsymbolicated. Metro's Sentry config stamps a Debug ID into the bundle and its map. A local `expo export --source-maps` showed the same ID in both (2026-10-21).
- **EAS Update** is not configured yet. When it is (the #58 "OTA fixes" item), every `eas update` must be followed by `npx sentry-expo-upload-sourcemaps dist` (Expo, "Using Sentry", read 2026-10-21). **Failure mode:** skip it and every user on that update gets minified, unreadable traces, while the reports keep arriving and look healthy. The step belongs in whatever script publishes updates, not in memory.
- **Embedded vs OTA.** The SDK's Expo context integration adds an `ota_updates` context (`is_enabled`, `is_embedded_launch`, `update_id`, `channel`, `runtime_version`) and tags `expo.updates.update_id` and `expo.updates.channel`, on JS events and on the native scope (`dist/js/integrations/expocontext.js`). Today `is_enabled` is `false` on every build; the update tags appear without code changes once `expo-updates` is installed.

## Vendor, region and cost (checked 2026-10-21)

- **Sentry pricing** (sentry.io/pricing): Developer, free, 5k errors per month, **one user**, 30-day lookback. Team, $26/month billed annually or $29 monthly, 50k errors, unlimited users, 90-day lookback. The free plan fits the pilot. A second team member reading crashes means Team. Sentry's pricing docs describe dropping data past a paid plan's budget; what the free plan does past 5k is **unverified**.
- **Region** (docs.sentry.io, "Data Storage Location"): US (Iowa) or EU (Frankfurt), on every plan including the free one. Events, releases, source maps and release health stay in the region. Account, organization settings, project metadata and DSN keys are always stored in the US. The region **cannot be changed** after the organization is created. We chose the EU: Customers are in Ukraine and possibly the EU.
- **Version.** Expo SDK 57 pins `@sentry/react-native ~7.11.0` (2026-01-29), released before React Native 0.86. 8.x fixes iOS logs and spans dropped on RN ≥ 0.86 (8.25.0), captures Android native errors that Expo's bridgeless handler swallowed (8.6.0) and adds the Expo Updates context (8.4.0) (CHANGELOG, read 2026-10-21). We hold 8.31.0 ahead of the SDK, with the maintainer's approval; `docs/agents/dependency-updates.md` says how it moves.

**EAS Observe instead.** On SDK 57, Observe's error reporting now shows JS errors and native crashes in its dashboard, which removes the reason #217 gave on 2026-08-17. We still do not choose it for the pilot. Error reporting is a **preview**. Its docs describe no hook for filtering or scrubbing an event before it leaves the device, only "avoid PII in error messages". They name no storage region. iOS native stacks are not symbolicated (docs.expo.dev/eas/observe/errors and /introduction, read 2026-10-21). It has the better OTA story, `eas update --upload-source-maps`. Revisit when error reporting leaves preview with a scrubbing hook and a stated region; the seam makes that a one-file change.

## Disclosure

Crash reports carry pseudonymous data: device, OS and app details, release-health session records, and whatever the deny-list lets through. Under GDPR and Ukraine's Law On Personal Data Protection that is personal data. Our reading (not legal advice) is that the lawful basis is legitimate interest (GDPR Art. 6(1)(f)): keeping the app working. That basis needs a **notice, not consent**. So:

- The disclosure lives in the **privacy policy (#352)**, not on the #24 consent card. That card asks a different question (café news), and bundling purposes into one consent is what GDPR forbids. A Customer who never earns a Зернятко also never sees it.
- The policy must state the vendor (Sentry), the EU (Frankfurt) region and the account metadata Sentry keeps in the US, the legitimate-interest basis, the categories sent, the categories withheld (the table above), and the retention (the plan's lookback).
- The App Store privacy label and Google Play's Data safety form declare crash data and diagnostics.

All three are pilot blockers on #58. Legal review of the policy text belongs to #352.

## Consequences

- The maintainer creates the Sentry organization (EU region), one React Native project and an **Organization Auth Token**, then sets three variables in each EAS environment that builds for testers: `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (secret) and `SENTRY_PROJECT`. The organization and its region come from the token. Procedure: `docs/deploy.md`, "Crash reporting".
- **Not done until demonstrated:** a release build sends a deliberate error, and its stack trace in Sentry resolves to TypeScript source lines. An unverified crash reporter is worse than none: it gives false confidence and will be believed. #217 stays open until then.
- The Sentry project keeps server-side data scrubbing on (Sentry's default) and stops storing IP addresses, as the backstop.
- A new event source (tracing, replay, user feedback, `Sentry.wrap`) is a new data flow. It needs a row in the table, a test, and an update to the privacy policy.
