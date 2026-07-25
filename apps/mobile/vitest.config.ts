import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Node-environment unit tests for pure logic (lib/). Anything rendering React
// Native stays out of here — on-device checks go through Argent instead
// (docs/argent-howto.md).
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
