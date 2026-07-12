// Variant A theme build (design-system/INTEGRATION.md): resolve the DTCG
// `{alias}` references down to primitives and convert `"16px" → 16` so React
// Native consumers get plain numbers, then emit a committed `theme.generated.ts`.
// Zero runtime dependencies. Pure transforms are exported for the unit test.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Flatten a DTCG token document into a nested plain object keyed by token name.
 * - `{color.neutral.50}` alias values resolve to the referenced primitive.
 * - dimension strings like `"16px"` become the number `16` (RN wants numbers);
 *   colours, motion durations/easings, and font families are left untouched.
 */
export function buildTheme(t) {
  const resolve = (v) =>
    typeof v === "string" && v.startsWith("{")
      ? resolve(
          v
            .slice(1, -1)
            .split(".")
            .reduce((o, k) => o[k], t)["$value"],
        )
      : v;

  const num = (v) =>
    typeof v === "string" && /^-?\d+(\.\d+)?px$/.test(v) ? parseFloat(v) : v;

  const walk = (node) => {
    if (node && node.$value !== undefined) return num(resolve(node.$value));
    const out = {};
    for (const [k, val] of Object.entries(node))
      if (!k.startsWith("$")) out[k] = walk(val);
    return out;
  };

  return {
    color: walk(t.color),
    light: walk(t.semantic.light),
    dark: walk(t.semantic.dark),
    font: walk(t.font),
    space: walk(t.space),
    radius: walk(t.radius),
    shadow: walk(t.shadow),
    motion: walk(t.motion),
  };
}

/** Render the generated TypeScript module for a built theme object. */
export function render(theme) {
  return (
    "// AUTO-GENERATED from design-tokens.json by scripts/build-theme.mjs — do not edit by hand.\n" +
    "// Regenerate with `pnpm --filter @kavtsya/mobile theme:build` after editing design-tokens.json.\n\n" +
    "export const tokens = " +
    JSON.stringify(theme, null, 2) +
    " as const;\n"
  );
}

// --- CLI: read src/theme/design-tokens.json → write src/theme/theme.generated.ts
function main() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const themeDir = path.join(dir, "..", "src", "theme");
  const src = path.join(themeDir, "design-tokens.json");
  const out = path.join(themeDir, "theme.generated.ts");

  const tokens = JSON.parse(fs.readFileSync(src, "utf8"));
  fs.writeFileSync(out, render(buildTheme(tokens)));
  console.log(`theme:build → ${path.relative(process.cwd(), out)}`);
}

const invokedDirectly =
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
