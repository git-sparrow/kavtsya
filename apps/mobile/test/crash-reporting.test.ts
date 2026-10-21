import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one seam crash reports leave the app through (#217). The SDK is stubbed:
 * what is under test is what we hand it, not what it does with it.
 */
const sentry = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }));
vi.mock("@sentry/react-native", () => sentry);

const DSN = "https://key@o1.ingest.de.sentry.io/2";

/** A fresh module graph, so each test reads the DSN its build would inline. */
async function load() {
  vi.resetModules();
  const { crashReportPrivacy } =
    await import("../src/lib/crash-report-privacy");
  return {
    crashReportPrivacy,
    ...(await import("../src/lib/crash-reporting")),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
});

describe("initCrashReporting", () => {
  it("starts nothing in a build without a DSN", async () => {
    const { initCrashReporting } = await load();

    initCrashReporting();

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("starts the SDK with the DSN behind the deny-list", async () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
    const { initCrashReporting, crashReportPrivacy } = await load();

    initCrashReporting();

    expect(sentry.init).toHaveBeenCalledWith({
      ...crashReportPrivacy,
      dsn: DSN,
      environment: "development",
    });
  });
});

describe("reportRenderError", () => {
  it("hands the caught error to the SDK as-is", async () => {
    const { reportRenderError } = await load();
    const error = new Error("render failed");

    reportRenderError(error);

    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });
});
