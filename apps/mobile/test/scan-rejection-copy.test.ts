import { scanRejectionStatuses } from "@kavtsya/shared";
import { expect, test } from "vitest";

import {
  rejectionCopy,
  SCAN_REJECTION_COPY,
} from "../src/features/scan/scan-copy";

/**
 * The scanner's rejected state (2f/2k, redesign turn 2) renders the #50
 * taxonomy as a bold title + a recovery instruction. This map is the single
 * place that copy lives, keyed by the shared `ScanRejection` codes — so a new
 * rejection reason is a compile error until it has counter-facing copy.
 */

test("every scan-rejection code has a non-empty title", () => {
  for (const code of Object.keys(scanRejectionStatuses)) {
    const copy =
      SCAN_REJECTION_COPY[code as keyof typeof scanRejectionStatuses];
    expect(copy, code).toBeDefined();
    expect(copy.title.length, code).toBeGreaterThan(0);
  }
});

test("expired token → «Код застарів» with the refresh recovery", () => {
  expect(SCAN_REJECTION_COPY.expired_token).toEqual({
    title: "Код застарів",
    detail: "Попроси клієнта оновити екран із QR — код живе 90 секунд",
  });
});

test("already-used token → «Код уже використано»", () => {
  expect(SCAN_REJECTION_COPY.token_used.title).toBe("Код уже використано");
  expect(SCAN_REJECTION_COPY.token_used.detail).toContain("оновити екран");
});

test("unknown member code → «Клієнта не знайдено»", () => {
  expect(SCAN_REJECTION_COPY.unknown_member_code.title).toBe(
    "Клієнта не знайдено",
  );
});

test("self-scan states the rule with no recovery detail", () => {
  expect(SCAN_REJECTION_COPY.self_scan.title).toContain("власний код");
  expect(SCAN_REJECTION_COPY.self_scan.detail).toBeUndefined();
});

test("rejectionCopy falls back to the raw message for a non-taxonomy error", () => {
  expect(rejectionCopy(null, "Немає з'єднання")).toEqual({
    title: "Немає з'єднання",
  });
});

test("rejectionCopy uses the taxonomy copy when a code is known", () => {
  expect(rejectionCopy("expired_token", "ignored fallback")).toEqual(
    SCAN_REJECTION_COPY.expired_token,
  );
});
