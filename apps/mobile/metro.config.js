// Metro must watch the whole monorepo and resolve hoisted node_modules so the
// Expo app can import the shared @kavtsya/shared package.
//
// Sentry's wrapper is Expo's default config plus a Debug ID stamped into each
// bundle and its source map, which is how a crash report finds its map (#217).
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getSentryExpoConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Package `exports` resolution is enabled by default in SDK 56's Metro, which
// @better-auth/expo relies on (it only exposes its /client entry via exports).

module.exports = config;
