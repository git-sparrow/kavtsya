import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAlias } from "@kavtsya/shared/design-tokens.mjs";

const kebab = (key) => key.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

function pxToRem(value) {
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (!px) return value;
  const n = parseFloat(px[1]) / 16;
  return n === 0 ? "0" : `${n}rem`;
}

function cssValue(token, tokens) {
  const value = resolveAlias(tokens, token.$value);
  switch (token.$type) {
    case "fontFamily":
      return value
        .map((name) => (/^[\w-]+$/.test(name) ? name : `"${name}"`))
        .join(", ");
    case "shadow": {
      const { offsetX, offsetY, blur, spread, color } = value;
      return (
        [offsetX, offsetY, blur, spread].map(pxToRem).join(" ") + ` ${color}`
      );
    }
    case "dimension":
      return pxToRem(value);
    default:
      return String(value);
  }
}

function declarations(node, prefix, tokens) {
  const out = [];
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    const name = `${prefix}-${kebab(key)}`;
    if (child.$value !== undefined) {
      out.push(`  ${name}: ${cssValue(child, tokens)};`);
    } else {
      out.push(...declarations(child, name, tokens));
    }
  }
  return out;
}

export function buildTokensCss(tokens) {
  const primitives = [
    "color",
    "font",
    "space",
    "radius",
    "shadow",
    "motion",
  ].flatMap((group) => declarations(tokens[group], `--${group}`, tokens));
  const light = declarations(tokens.semantic.light, "--semantic", tokens);
  const dark = declarations(tokens.semantic.dark, "--semantic", tokens);
  return [
    "/* AUTO-GENERATED from @kavtsya/shared/design-tokens.json by scripts/build-tokens-css.mjs. Do not edit. */",
    ":root {",
    ...primitives,
    ...light,
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    "  :root {",
    ...dark.map((line) => `  ${line}`),
    "  }",
    "}",
    "",
  ].join("\n");
}

function main() {
  const src = createRequire(import.meta.url).resolve(
    "@kavtsya/shared/design-tokens.json",
  );
  const out = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "styles",
    "tokens.css",
  );
  const tokens = JSON.parse(fs.readFileSync(src, "utf8"));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buildTokensCss(tokens));
  console.log(`tokens:build → ${path.relative(process.cwd(), out)}`);
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(fileURLToPath(import.meta.url))
)
  main();
