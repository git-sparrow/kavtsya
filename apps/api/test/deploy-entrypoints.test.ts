import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { bundleNames } from "../scripts/build";

const repoRoot = join(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

/** Every bundle a deploy runs: `node dist/<name>.mjs` commands, cron names, CMD. */
function bundlesRunByDeploy(): Set<string> {
  const railway = read(".railway/railway.ts");
  const dockerfile = read("apps/api/Dockerfile");
  const names = [
    ...railway.matchAll(/node dist\/([\w-]+)\.mjs/g),
    ...railway.matchAll(/cron\(\s*"([\w-]+)"/g),
    ...dockerfile.matchAll(/^CMD \["node", "dist\/([\w-]+)\.mjs"\]/gm),
  ].map((m) => m[1] as string);
  return new Set(names);
}

test("the deploy runs only bundles the build produces, and every one of them", () => {
  expect([...bundlesRunByDeploy()].sort()).toEqual([...bundleNames].sort());
});
