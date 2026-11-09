import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** @param {string[]} paths @returns {"web" | "full"} */
export function scopeOf(paths) {
  const changed = paths.filter(Boolean);
  if (changed.length === 0) return "full";
  return changed.every((file) => file.startsWith("apps/web/")) ? "web" : "full";
}

/** `--no-renames` lists both sides of a move, so a file moved out of apps/web counts. */
function changedPaths(base) {
  return execFileSync("git", ["diff", "--name-only", "--no-renames", base], {
    encoding: "utf8",
  }).split("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let scope;
  try {
    scope = scopeOf(changedPaths(process.argv[2] ?? "HEAD^1"));
  } catch {
    scope = "full";
  }
  console.log(scope);
}
