import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTokensCss } from "../scripts/build-tokens-css.mjs";

const fixture = {
  color: {
    primary: { 500: { $value: "#b48300", $type: "color" } },
    neutral: { 50: { $value: "#fbf6ec", $type: "color" } },
    base: { white: { $value: "#ffffff", $type: "color" } },
  },
  semantic: {
    light: {
      background: { $value: "{color.neutral.50}", $type: "color" },
      "text-muted": { $value: "{color.primary.500}", $type: "color" },
    },
    dark: {
      background: { $value: "{color.base.white}", $type: "color" },
      "text-muted": { $value: "{color.primary.500}", $type: "color" },
    },
  },
  font: {
    family: {
      display: { $value: ["Cormorant Garamond", "serif"], $type: "fontFamily" },
    },
    size: { base: { $value: "16px", $type: "dimension" } },
    lineHeight: { tight: { $value: 1.2, $type: "number" } },
  },
  space: { 0: { $value: "0px", $type: "dimension" } },
  radius: { md: { $value: "14px", $type: "dimension" } },
  shadow: {
    card: {
      $type: "shadow",
      $value: {
        color: "#50371e26",
        offsetX: "0px",
        offsetY: "8px",
        blur: "22px",
        spread: "0px",
      },
    },
  },
  motion: {
    duration: { fast: { $value: "150ms", $type: "duration" } },
  },
};

const css = buildTokensCss(fixture);
const [rootBlock, darkBlock] = css.split("@media (prefers-color-scheme: dark)");

test("a color scale token becomes a :root property named from its path", () => {
  assert.match(rootBlock, /:root \{[^}]*--color-primary-500: #b48300;/);
});

test("a semantic token emits its light value under :root and its dark value under the dark media query", () => {
  assert.match(rootBlock, /--semantic-background: #fbf6ec;/);
  assert.match(darkBlock, /--semantic-background: #ffffff;/);
  assert.doesNotMatch(darkBlock, /#fbf6ec/);
});

test("a token reference resolves to its final value, not a var() or alias", () => {
  assert.match(rootBlock, /--semantic-text-muted: #b48300;/);
  assert.doesNotMatch(css, /[{]color\.|var\(/);
});

test("dimensions become rem, families are quoted when they need it, and camelCase keys become kebab-case", () => {
  assert.match(rootBlock, /--font-size-base: 1rem;/);
  assert.match(rootBlock, /--radius-md: 0\.875rem;/);
  assert.match(rootBlock, /--space-0: 0;/);
  assert.match(
    rootBlock,
    /--font-family-display: "Cormorant Garamond", serif;/,
  );
  assert.match(rootBlock, /--font-line-height-tight: 1\.2;/);
  assert.match(rootBlock, /--shadow-card: 0 0\.5rem 1\.375rem 0 #50371e26;/);
  assert.match(rootBlock, /--motion-duration-fast: 150ms;/);
});
