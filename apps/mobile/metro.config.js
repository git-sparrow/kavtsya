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

// Honor the `exports` field in package.json. @better-auth/expo only exposes its
// `/client` (and `/plugins`) entry points via `exports`, mapping to ./dist/*;
// without this Metro looks for a literal ./client.js at the package root and
// fails to resolve. Opt-in in Expo SDK 52's Metro.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
