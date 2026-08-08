import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit tests for pure logic (`lib/`, and the copy/derivation modules under
// `features/`), in Node by default. A test that needs to render opts into jsdom
// per file with a `// @vitest-environment jsdom` docblock — that is how hooks
// containing no React Native get exercised against react-dom (#53). Anything
// rendering React Native itself stays out of here entirely; on-device checks go
// through Argent instead (docs/argent-howto.md).
export default defineConfig({
  // Mirror the app's `@/*` → `src/*` path alias (tsconfig.json) so a tested
  // module imports its neighbours the same way the app does.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    server: {
      deps: {
        // Externalized packages import Expo native modules with node's own
        // loader, bypassing vi.mock — inline this one so its imports hit the
        // test's mock registry.
        inline: [/@better-auth\/expo/],
      },
    },
  },
});
