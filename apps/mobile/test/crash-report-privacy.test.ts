import type { ErrorEvent } from "@sentry/react-native";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { crashReportPrivacy } from "../src/lib/crash-report-privacy";

/**
 * The deny-list for what crash reports may carry off the device (#217). A QR
 * token or a session cookie in a report is an auth-adjacent credential leaving
 * our infrastructure, so every case below is a leak these options exist to stop.
 */

const EMAIL = "olena.koval@example.com";
// The shape signed-token.ts mints: base64url JSON body, "." and a SHA-256 HMAC.
const QR_TOKEN =
  "eyJ1c2VySWQiOiJhYmMiLCJleHAiOjE3MDAwMDAwMDB9.Wm9P1x5rQ2c3Z9yK8sLmN4tV7bH0dJfA6eGqXiUoTpw";
const MEMBER_CODE = "7KQ4M9TZ";
const PUSH_TOKEN = "ExponentPushToken[xAbC123dEfG456hIjK]";

/** Text that would leak without a rule: what it is, the text, the secret in it. */
const LEAKS: [string, string, string][] = [
  ["an email", `No account for ${EMAIL}`, EMAIL],
  ["a QR token", `Rejected token ${QR_TOKEN}`, QR_TOKEN],
  ["a raw member code", `Unknown code ${MEMBER_CODE}`, MEMBER_CODE],
  ["a grouped member code", "Unknown code 7KQ4-M9TZ", "7KQ4-M9TZ"],
  ["a space-grouped member code", "Unknown code 7KQ4 M9TZ", "7KQ4 M9TZ"],
  ["an Expo push token", `Dead device ${PUSH_TOKEN}`, PUSH_TOKEN],
  ["a newer Expo push token", "Dead ExpoPushToken[abc123]", "abc123"],
  [
    "a bare session token",
    "Rejected session Zk3vQ9pL2xR7mT4nB8cY1wH6dF5gJ0aS",
    "Zk3vQ9pL2xR7mT4nB8cY1wH6dF5gJ0aS",
  ],
  ["a credential pair", "cookie: session_token=abc.def", "abc.def"],
  ["a path's query string", "GET /api/purchases?token=secret failed", "secret"],
  [
    "a URL's query string",
    "Failed kavtsya://auth?cookie=better-auth.session_token%3Dabc",
    "session_token",
  ],
  ["a bearer credential", "Authorization: Bearer abc.def.ghi", "abc.def.ghi"],
];

const { beforeSend: send, beforeBreadcrumb: crumb } = crashReportPrivacy;

function errorEvent(value: string, extra: Partial<ErrorEvent> = {}) {
  return {
    type: undefined,
    exception: { values: [{ type: "Error", value }] },
    ...extra,
  } as ErrorEvent;
}

describe("crashReportPrivacy: SDK switches", () => {
  it("keeps every automatic PII and capture source off", () => {
    expect(crashReportPrivacy).toMatchObject({
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      // Handled HTTP failures belong to the screen that shows them (#53, #190).
      enableCaptureFailedRequests: false,
      // iOS would otherwise record every request natively, out of beforeBreadcrumb's reach.
      enableNetworkBreadcrumbs: false,
    });
  });
});

describe("crashReportPrivacy: error text", () => {
  it.each(LEAKS)("redacts %s from exception values", (_, message, secret) => {
    const value = send(errorEvent(message))?.exception?.values?.[0]?.value;

    expect(value).not.toContain(secret);
    expect(value).toContain("[redacted]");
  });

  it("redacts the event message", () => {
    const event = send({ type: undefined, message: `Signed in as ${EMAIL}` });

    expect(event?.message).toBe("Signed in as [redacted]");
  });

  it("keeps release and package identifiers readable", () => {
    const message = "react-native@0.86.3 in com.kavtsya.app@1.0.0+3";

    expect(send(errorEvent(message))?.exception?.values?.[0]?.value).toBe(
      message,
    );
  });

  it("redacts any 8-character uppercase token, a code or not", () => {
    // The price of matching member codes without knowing which tokens are codes.
    expect(
      send(errorEvent("hash DEADBEEF"))?.exception?.values?.[0]?.value,
    ).toBe("hash [redacted]");
  });

  it("leaves ordinary error text alone", () => {
    const message = "Cannot read property 'balance' of undefined";

    expect(send(errorEvent(message))?.exception?.values?.[0]?.value).toBe(
      message,
    );
  });
});

describe("crashReportPrivacy: event context", () => {
  it("drops the request, its headers, body and cookies", () => {
    const event = send(
      errorEvent("boom", {
        request: {
          url: "https://api.kavtsya.com/api/purchases",
          headers: { cookie: "better-auth.session_token=abc" },
          data: { qrToken: QR_TOKEN },
        },
      }),
    );

    expect(event?.request).toBeUndefined();
  });

  it("drops extras, which the app never sets", () => {
    const event = send(errorEvent("boom", { extra: { email: EMAIL } }));

    expect(event?.extra).toBeUndefined();
  });

  it("keeps only an opaque user id", () => {
    const event = send(
      errorEvent("boom", {
        user: {
          id: "install-1",
          email: EMAIL,
          username: "olena",
          ip_address: "203.0.113.7",
        },
      }),
    );

    expect(event?.user).toEqual({ id: "install-1" });
  });

  it("scrubs breadcrumbs that ride on the event", () => {
    const event = send(
      errorEvent("boom", {
        breadcrumbs: [
          { category: "console", message: EMAIL },
          { category: "ui", message: `Opened ${MEMBER_CODE}` },
        ],
      }),
    );

    expect(event?.breadcrumbs).toEqual([
      { category: "ui", message: "Opened [redacted]" },
    ]);
  });
});

describe("crashReportPrivacy: breadcrumbs", () => {
  it("drops console breadcrumbs, whatever was logged", () => {
    expect(crumb({ category: "console", message: "hello" })).toBeNull();
  });

  it.each(["fetch", "xhr"])(
    "keeps a %s breadcrumb's method, status and path only",
    (category) => {
      const result = crumb({
        category,
        type: "http",
        data: {
          method: "POST",
          status_code: 409,
          url: "https://api.kavtsya.com/api/purchases?token=abc#frag",
          request_body: { qrToken: QR_TOKEN },
          response_body_size: 120,
        },
      });

      expect(result?.data).toEqual({
        method: "POST",
        status_code: 409,
        url: "https://api.kavtsya.com/api/purchases",
      });
    },
  );

  it("redacts the message and drops the data of any other breadcrumb", () => {
    const result = crumb({
      category: "sentry.event",
      message: `Error for ${EMAIL}`,
      data: { email: EMAIL },
    });

    expect(result).toEqual({
      category: "sentry.event",
      message: "Error for [redacted]",
    });
  });
});

/**
 * A native crash's own text is scrubbed only by the Sentry project's Advanced
 * Data Scrubbing rules, which docs/deploy.md lists for the maintainer to enter.
 * They must stop what the JS deny-list stops, so they are read from the doc and
 * run against the same leaks. Emails are Sentry's built-in "Email Addresses"
 * type, which has no regex to run here.
 */
describe("Sentry's server-side scrubbing rules in docs/deploy.md", () => {
  const doc = readFileSync(
    new URL("../../../docs/deploy.md", import.meta.url),
    "utf8",
  );
  const rules = [...doc.matchAll(/^\s*\| Regex Matches \| `(.+)` \|$/gm)].map(
    ([, cell]) => {
      const source = cell.replace(/\\\|/g, "|");
      return source.startsWith("(?i)")
        ? new RegExp(source.slice(4), "gi")
        : new RegExp(source, "g");
    },
  );

  it("are all listed", () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  const scrub = (text: string) =>
    rules.reduce(
      (scrubbed, rule) => scrubbed.replace(rule, "[redacted]"),
      text,
    );

  it.each(LEAKS.filter(([what]) => what !== "an email"))(
    "redact %s",
    (_, message, secret) => {
      expect(scrub(message)).not.toContain(secret);
    },
  );

  // The native-shaped event the release proof sends (docs/deploy.md): every
  // planted value in a field the rules read must be one the rules redact, or
  // the proof would fail on a gap in the rules rather than in Sentry.
  it("redact everything planted in the native probe event", () => {
    const probe = JSON.parse(
      readFileSync(
        new URL("./fixtures/sentry-native-probe.json", import.meta.url),
        "utf8",
      ),
    );
    const fields: string[] = [
      probe.message,
      ...probe.exception.values.map((e: { value: string }) => e.value),
      ...probe.breadcrumbs.values.flatMap(
        (b: { message: string; data: Record<string, string> }) => [
          b.message,
          ...Object.values(b.data),
        ],
      ),
    ];
    // Emails and IPs are Sentry's built-in types, so no regex to run here.
    const planted =
      /7KQ4.?M9TZ|ExponentPushToken|token=s|Bearer abc|cookie=abc|Zk3vQ9|eyJ/;

    expect(fields.map(scrub).filter((field) => planted.test(field))).toEqual(
      [],
    );
  });
});
