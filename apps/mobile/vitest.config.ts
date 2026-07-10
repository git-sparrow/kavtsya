import { defineConfig } from "vitest/config";

// Node-environment unit tests for pure logic (lib/). Anything rendering React
// Native stays out of here — on-device checks go through Argent instead
// (docs/argent-howto.md).
export default defineConfig({
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
