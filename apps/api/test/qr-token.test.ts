import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { fixedClock } from "../src/clock";
import { signQrToken, validateQrToken } from "../src/qr-token";

const SECRET = "qr-token-test-secret-at-least-32-chars-long";

/** Mint a correctly-signed token for an arbitrary (possibly malformed) payload. */
function forgeSignedToken(payload: unknown, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret)
    .update(body)
    .digest()
    .toString("base64url");
  return `${body}.${sig}`;
}

// --- sign → validate round-trip ----------------------------------------------

test("a freshly signed token validates back to its Customer", () => {
  const clock = fixedClock(new Date("2026-06-27T10:00:00Z"));

  const { token, jti } = signQrToken("customer-1", {
    clock,
    secret: SECRET,
    ttlSeconds: 90,
  });
  const result = validateQrToken(token, {
    clock,
    secret: SECRET,
    graceSeconds: 30,
  });

  expect(result).toEqual({ valid: true, customerId: "customer-1", jti });
});

test("each signed token carries a unique jti", () => {
  const clock = fixedClock(new Date("2026-06-27T10:00:00Z"));
  const opts = { clock, secret: SECRET, ttlSeconds: 90 };

  const a = signQrToken("customer-1", opts);
  const b = signQrToken("customer-1", opts);

  expect(a.jti).not.toEqual(b.jti);
  expect(a.token).not.toEqual(b.token);
});

test("expiresAt is iat + ttl under a frozen clock", () => {
  const clock = fixedClock(new Date("2026-06-27T10:00:00Z"));

  const { expiresAt } = signQrToken("customer-1", {
    clock,
    secret: SECRET,
    ttlSeconds: 90,
  });

  expect(expiresAt).toEqual(new Date("2026-06-27T10:01:30Z"));
});

// --- integrity ---------------------------------------------------------------

test("a token whose payload was tampered with is rejected as bad_signature", () => {
  const clock = fixedClock(new Date("2026-06-27T10:00:00Z"));
  const { token } = signQrToken("customer-1", {
    clock,
    secret: SECRET,
    ttlSeconds: 90,
  });

  // Re-encode the body for a different Customer, keep the original signature.
  const [, sig] = token.split(".");
  const forgedBody = Buffer.from(
    JSON.stringify({ sub: "attacker", jti: "x", iat: 0, exp: 9999999999 }),
  ).toString("base64url");
  const forged = `${forgedBody}.${sig}`;

  const result = validateQrToken(forged, {
    clock,
    secret: SECRET,
    graceSeconds: 30,
  });

  expect(result).toEqual({ valid: false, reason: "bad_signature" });
});

test("a token signed with a different secret is rejected as bad_signature", () => {
  const clock = fixedClock(new Date("2026-06-27T10:00:00Z"));
  const { token } = signQrToken("customer-1", {
    clock,
    secret: "some-other-secret-also-at-least-32-characters",
    ttlSeconds: 90,
  });

  const result = validateQrToken(token, {
    clock,
    secret: SECRET,
    graceSeconds: 30,
  });

  expect(result).toEqual({ valid: false, reason: "bad_signature" });
});

test("a garbage string is rejected as malformed", () => {
  const clock = fixedClock(new Date("2026-06-27T10:00:00Z"));

  const result = validateQrToken("not-a-real-token", {
    clock,
    secret: SECRET,
    graceSeconds: 30,
  });

  expect(result).toEqual({ valid: false, reason: "malformed" });
});

test("a correctly-signed token missing exp is rejected as malformed, not treated as never-expiring", () => {
  const clock = fixedClock(new Date("2026-06-27T10:00:00Z"));
  // A real signature over a structurally-incomplete payload (no exp/sub) — the
  // shape a future signing bug could produce. Must not slip through as valid.
  const token = forgeSignedToken({ jti: "abc", iat: 0 }, SECRET);

  const result = validateQrToken(token, {
    clock,
    secret: SECRET,
    graceSeconds: 30,
  });

  expect(result).toEqual({ valid: false, reason: "malformed" });
});

test("a correctly-signed token with an empty sub is rejected as malformed", () => {
  const clock = fixedClock(new Date("2026-06-27T10:00:00Z"));
  const token = forgeSignedToken(
    { sub: "", jti: "abc", iat: 0, exp: 9999999999 },
    SECRET,
  );

  const result = validateQrToken(token, {
    clock,
    secret: SECRET,
    graceSeconds: 30,
  });

  expect(result).toEqual({ valid: false, reason: "malformed" });
});

// --- expiry + grace window ---------------------------------------------------

test("a token past nominal expiry but within the grace window still validates", () => {
  const signClock = fixedClock(new Date("2026-06-27T10:00:00Z"));
  const { token } = signQrToken("customer-1", {
    clock: signClock,
    secret: SECRET,
    ttlSeconds: 90,
  });

  // exp is 10:01:30; +20s past it, inside a 30s grace.
  const scanClock = fixedClock(new Date("2026-06-27T10:01:50Z"));
  const result = validateQrToken(token, {
    clock: scanClock,
    secret: SECRET,
    graceSeconds: 30,
  });

  expect(result.valid).toBe(true);
});

test("a token past expiry plus the grace window is rejected as expired", () => {
  const signClock = fixedClock(new Date("2026-06-27T10:00:00Z"));
  const { token } = signQrToken("customer-1", {
    clock: signClock,
    secret: SECRET,
    ttlSeconds: 90,
  });

  // exp is 10:01:30; +31s past it, just beyond a 30s grace.
  const scanClock = fixedClock(new Date("2026-06-27T10:02:01Z"));
  const result = validateQrToken(token, {
    clock: scanClock,
    secret: SECRET,
    graceSeconds: 30,
  });

  expect(result).toEqual({ valid: false, reason: "expired" });
});
