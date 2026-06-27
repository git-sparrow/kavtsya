// Flat config (ESLint 9). One config governs the whole monorepo, run from the
// repo root via `pnpm lint`. ESLint has no rc-file form for flat config, so the
// .mjs file is required here.
import tseslint from "typescript-eslint";
import expoFlat from "eslint-config-expo/flat.js";
import prettier from "eslint-config-prettier/flat";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.expo/**",
      "apps/mobile/android/**",
      "apps/mobile/ios/**",
      "**/expo-env.d.ts",
      ".agents/skills/**",
      ".claude/skills/**",
      "learning/**",
    ],
  },

  // API + shared packages: Node/TypeScript. Non-type-aware recommended rules
  // (fast, no project service needed — keeps the pre-commit hook snappy).
  {
    files: ["apps/api/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
  },

  // Mobile: Expo's own config (React Native + TypeScript aware). Point the
  // import resolver at the mobile tsconfig so `@/*` path aliases resolve.
  {
    files: ["apps/mobile/**/*.{ts,tsx,js,jsx}"],
    extends: [expoFlat],
    settings: {
      "import/resolver": {
        typescript: { project: "apps/mobile/tsconfig.json" },
      },
    },
  },

  // Config files legitimately use CommonJS require().
  {
    files: ["**/*.config.{js,cjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Disable stylistic rules that conflict with Prettier. Keep last.
  prettier,
);
