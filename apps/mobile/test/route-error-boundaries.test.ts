import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

// Expo Router wraps a route in an error boundary only when the route file
// exports `ErrorBoundary`; there is no default at any level (#216). A route
// added without one would let a render error in it take down its whole group,
// so every route file, layouts included, must export one.
const APP_DIR = fileURLToPath(new URL("../src/app", import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const EXPORTS_ERROR_BOUNDARY =
  /^export (?:function ErrorBoundary\b|\{[^}]*\bErrorBoundary\s*\})/m;

test("every route file exports an ErrorBoundary", () => {
  const missing = routeFiles(APP_DIR)
    .filter((file) => !EXPORTS_ERROR_BOUNDARY.test(readFileSync(file, "utf8")))
    .map((file) => relative(APP_DIR, file));

  expect(missing).toEqual([]);
});
