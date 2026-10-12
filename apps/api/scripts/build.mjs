// Bundles the production entrypoints into dist/ (#310). The image ships these
// bundles and migrations/ only, so packages the code never imports — the
// optional Expo peers of @better-auth/expo among them — stay out of it.
import { build } from "esbuild";

const entryPoints = [
  "src/index.ts",
  "scripts/migrate.ts",
  "scripts/generate-fortunes.ts",
  "scripts/prune-push-receipts.ts",
  "scripts/prune-expired-sessions.ts",
];

await build({
  entryPoints,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outdir: "dist",
  // Flat, so src/migrate.ts's `../migrations` still resolves from dist/.
  entryNames: "[name]",
  outExtension: { ".js": ".mjs" },
  sourcemap: true,
  // pg loads its optional native binding only when asked to; we never do.
  external: ["pg-native"],
  // Bundled CommonJS packages call require(); ESM has none of its own.
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  logLevel: "info",
});
