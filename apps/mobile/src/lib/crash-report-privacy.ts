import { MEMBER_CODE_ALPHABET, MEMBER_CODE_LENGTH } from "@kavtsya/shared";
import type {
  Breadcrumb,
  ErrorEvent,
  ReactNativeOptions,
} from "@sentry/react-native";

const REDACTED = "[redacted]";

const MEMBER_CODE_HALF = `[${MEMBER_CODE_ALPHABET}]{${MEMBER_CODE_LENGTH / 2}}`;

/**
 * What may never leave the device in an error message or breadcrumb, in the
 * order applied: a URL or path loses its query first (a Better Auth deep link
 * carries the session cookie there), before the narrower patterns see the rest.
 *
 * Sentry's server-side scrubbing rules repeat these for native crash text,
 * which never passes through here (docs/deploy.md); change both together.
 *
 * The member code is matched in its canonical uppercase form, raw or grouped,
 * which is the only form the app holds once a typed code is normalized; any
 * 8-character uppercase token is redacted with it. Matching typed lowercase too
 * would redact every 8-letter word in an ordinary error message.
 */
const SECRETS: readonly [RegExp, string][] = [
  [/((?:[a-z][a-z0-9+.-]*:\/\/|\/)[^\s?#]*)[?#]\S*/gi, `$1?${REDACTED}`],
  [/\bBearer\s+\S+/gi, `Bearer ${REDACTED}`],
  [
    /\b(session_token|token|cookie|authorization)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
    `$1$2${REDACTED}`,
  ],
  [/[^\s@]+@[^\s@]+\.[a-z]{2,}\b/gi, REDACTED],
  [/Expo(?:nent)?PushToken\[[^\]]*\]/g, REDACTED],
  // Signed `<body>.<sig>` tokens (the QR, ADR 0006) and JWT-shaped ones.
  [/[A-Za-z0-9_-]{16,}(?:\.[A-Za-z0-9_-]{16,})+/g, REDACTED],
  // Opaque session tokens and other long random ids.
  [/[A-Za-z0-9_-]{32,}/g, REDACTED],
  [
    new RegExp(`\\b${MEMBER_CODE_HALF}[\\s-]?${MEMBER_CODE_HALF}\\b`, "g"),
    REDACTED,
  ],
];

function redact(text: string): string {
  return SECRETS.reduce(
    (scrubbed, [pattern, replacement]) =>
      scrubbed.replace(pattern, replacement),
    text,
  );
}

const HTTP_CATEGORIES = new Set(["fetch", "xhr"]);

/**
 * Console output is dropped whole, since anything can be logged. An HTTP
 * breadcrumb keeps its method, status and path, never a body or a query. Any
 * other breadcrumb keeps its category and a redacted message but no data,
 * because its data's shape is whatever the integration chose.
 */
function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;

  const { data, message, ...rest } = breadcrumb;
  const scrubbed: Breadcrumb = { ...rest };
  if (message !== undefined) scrubbed.message = redact(message);

  if (breadcrumb.category && HTTP_CATEGORIES.has(breadcrumb.category) && data) {
    const { method, status_code, url } = data;
    scrubbed.data = { method, status_code };
    if (typeof url === "string") {
      scrubbed.data.url = redact(url.split(/[?#]/)[0]);
    }
  }
  return scrubbed;
}

function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.request;
  // The app sets no extras, so any that appear came from somewhere unvetted.
  delete event.extra;

  const id = event.user?.id;
  if (id === undefined) delete event.user;
  else event.user = { id };

  if (event.message !== undefined) event.message = redact(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value !== undefined) {
      exception.value = redact(exception.value);
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.flatMap(
      (breadcrumb) => scrubBreadcrumb(breadcrumb) ?? [],
    );
  }
  return event;
}

/**
 * The deny-list for every crash report built in JavaScript (#217, ADR 0019).
 *
 * `beforeSend` runs on JavaScript events only; a native crash is sent by the
 * native SDK, which never calls it. A native report does carry the JS scope's
 * breadcrumbs, and the SDK syncs each breadcrumb to native only after
 * `beforeBreadcrumb`, so scrubbing there covers both kinds of report.
 */
export const crashReportPrivacy = {
  sendDefaultPii: false,
  attachScreenshot: false,
  attachViewHierarchy: false,
  enableCaptureFailedRequests: false,
  enableNetworkBreadcrumbs: false,
  beforeSend: (event: ErrorEvent) => scrubEvent(event),
  beforeBreadcrumb: (breadcrumb: Breadcrumb) => scrubBreadcrumb(breadcrumb),
} satisfies ReactNativeOptions;
