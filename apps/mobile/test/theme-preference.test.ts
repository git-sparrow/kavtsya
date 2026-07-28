import { expect, test } from "vitest";

import {
  parseThemePreference,
  resolveTheme,
  themeChangeAnnouncement,
} from "@/theme/preference";

/**
 * The theme preference (#162, turn 10a): one stored choice — «Системна» /
 * «Світла» / «Темна» — resolved against the OS colour scheme into the single
 * theme the whole app renders in. Pure logic, pinned here so the on-device
 * surfaces (checked via Argent) rest on a proven resolution.
 */

test("«Системна» follows the phone: dark OS renders dark, light renders light", () => {
  expect(resolveTheme("system", "dark")).toBe("dark");
  expect(resolveTheme("system", "light")).toBe("light");
});

test("an explicit choice overrides the phone in both directions", () => {
  expect(resolveTheme("light", "dark")).toBe("light");
  expect(resolveTheme("dark", "light")).toBe("dark");
});

test("an unknown OS scheme falls back to light — the calm everyday", () => {
  // useColorScheme reports "unspecified" when the OS has no preference, and
  // null/undefined on a platform that can't answer at all.
  expect(resolveTheme("system", "unspecified")).toBe("light");
  expect(resolveTheme("system", null)).toBe("light");
  expect(resolveTheme("system", undefined)).toBe("light");
  // …but never at the cost of an explicit choice.
  expect(resolveTheme("dark", null)).toBe("dark");
});

// --- what came back off the device ---------------------------------------------

test("nothing stored yet means «Системна» — the default", () => {
  expect(parseThemePreference(null)).toBe("system");
});

test("each stored choice round-trips", () => {
  expect(parseThemePreference("system")).toBe("system");
  expect(parseThemePreference("light")).toBe("light");
  expect(parseThemePreference("dark")).toBe("dark");
});

test("junk in the store degrades to «Системна» rather than throwing", () => {
  // A hand-edited store, or a value written by a future version we can't read.
  expect(parseThemePreference("sepia")).toBe("system");
  expect(parseThemePreference("")).toBe("system");
});

// --- what a screen-reader hears ------------------------------------------------

test("changing the theme announces the choice by name", () => {
  expect(themeChangeAnnouncement("dark")).toBe("Тему змінено: темна");
  expect(themeChangeAnnouncement("light")).toBe("Тему змінено: світла");
  expect(themeChangeAnnouncement("system")).toBe("Тему змінено: системна");
});
