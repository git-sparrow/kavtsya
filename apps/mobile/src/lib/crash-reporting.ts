import * as Sentry from "@sentry/react-native";

import { crashReportPrivacy } from "@/lib/crash-report-privacy";

/**
 * The one place crash reports leave the app (#217, ADR 0019). Nothing else
 * imports the vendor SDK (ESLint enforces it), so swapping vendors, say for
 * EAS Observe once it shows errors, touches only this file.
 *
 * A build without `EXPO_PUBLIC_SENTRY_DSN` (local development, tests) starts
 * nothing. Once started, the SDK reports uncaught errors and unhandled promise
 * rejections by itself; handled failures, such as a read `useApiResource`
 * turns into a StatusStrip, are never reported.
 *
 * Release and dist are left to the SDK, which reads them from the native build
 * (`<bundle id>@<version>+<build>`), the same identity the build uploads its
 * source maps under.
 */
export function initCrashReporting(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    ...crashReportPrivacy,
    dsn,
    environment: __DEV__ ? "development" : "production",
  });
}

/**
 * Where a render error caught by an error boundary (#216) is reported. React
 * Native's own handling of a caught error goes to `ExceptionsManager`, which
 * the SDK does not hook, so without this call the error would go unreported.
 */
export function reportRenderError(error: Error): void {
  Sentry.captureException(error);
}
