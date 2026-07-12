import { expect, test } from "vitest";

// The theme build is the seam between Mari's DTCG source of truth and the app:
// it must resolve semantic `{alias}` references down to primitives and convert
// dimension strings to the plain numbers React Native expects, while leaving
// colours and other strings exactly as authored.
import { buildTheme } from "../scripts/build-theme.mjs";

const fixture = {
  color: {
    primary: { 400: { $value: "#e8b44a", $type: "color" } },
    neutral: { 50: { $value: "#fbf6ec", $type: "color" } },
  },
  semantic: {
    light: {
      background: { $value: "{color.neutral.50}", $type: "color" },
      primary: { $value: "{color.primary.400}", $type: "color" },
    },
    dark: {
      background: { $value: "{color.primary.400}", $type: "color" },
    },
  },
  font: {
    size: { base: { $value: "16px", $type: "dimension" } },
    weight: { bold: { $value: 700, $type: "fontWeight" } },
  },
  space: { 4: { $value: "16px", $type: "dimension" } },
  radius: { md: { $value: "14px", $type: "dimension" } },
  shadow: {},
  motion: {
    duration: { fast: { $value: "150ms", $type: "duration" } },
  },
};

test("semantic aliases resolve to their primitive hex value", () => {
  const theme = buildTheme(fixture);
  expect(theme.light.background).toBe("#fbf6ec");
  expect(theme.light.primary).toBe("#e8b44a");
  expect(theme.dark.background).toBe("#e8b44a");
});

test("dimension strings become numbers so RN gets plain values", () => {
  const theme = buildTheme(fixture);
  expect(theme.space["4"]).toBe(16);
  expect(theme.radius.md).toBe(14);
  expect(theme.font.size.base).toBe(16);
});

test("non-dimension values are left as authored", () => {
  const theme = buildTheme(fixture);
  // colours stay hex strings, weights stay numbers, durations keep their unit
  expect(theme.color.primary["400"]).toBe("#e8b44a");
  expect(theme.font.weight.bold).toBe(700);
  expect(theme.motion.duration.fast).toBe("150ms");
});
