// Metro must watch the whole monorepo and resolve hoisted node_modules so the
// Expo app can import the shared @kavtsya/shared package.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Package `exports` resolution is enabled by default in SDK 56's Metro, which
// @better-auth/expo relies on (it only exposes its /client entry via exports).

module.exports = config;
