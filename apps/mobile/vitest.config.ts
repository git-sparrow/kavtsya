import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit tests for pure logic (`lib/`, and the copy/derivation modules under
// `features/`), plus the hooks — all in Node, with no DOM anywhere. Hooks render
// through `test/support/render-hook.tsx`, which builds an in-memory tree instead
// of DOM nodes (#53), so no jsdom environment and no react-dom are involved.
// Anything rendering React Native itself stays out of here entirely; on-device
// checks go through Argent instead (docs/argent-howto.md).
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
