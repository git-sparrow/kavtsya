// Flat config (ESLint 9). One config governs the whole monorepo, run from the
// repo root via `pnpm lint`. ESLint has no rc-file form for flat config, so the
// .mjs file is required here.
import tseslint from "typescript-eslint";
import expoFlat from "eslint-config-expo/flat.js";
import prettier from "eslint-config-prettier/flat";

const SET_ITEM_MESSAGE =
  "use setAccountEntry and add the entry to ACCOUNT_ENTRIES";

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
      ".agents/plugins/**",
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
    files: ["apps/mobile/**/*.{ts,tsx,mts,js,jsx}"],
    extends: [expoFlat],
    settings: {
      "import/resolver": {
        typescript: { project: "apps/mobile/tsconfig.json" },
      },
    },
  },

  // Crash reporting leaves the app through one seam (#217, ADR 0019), so a
  // vendor swap stays one file. Type-only imports carry no SDK at runtime.
  {
    files: ["apps/mobile/src/**/*.{ts,tsx}"],
    ignores: ["apps/mobile/src/lib/crash-reporting.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@sentry/*"],
              allowTypeImports: true,
              message:
                "Report through @/lib/crash-reporting; only it imports the SDK.",
            },
          ],
        },
      ],
    },
  },

  // Per-account SecureStore writes go through setAccountEntry so sign-out can
  // clear them (#402, #445). Per-device writes (device id, theme) are allowed.
  {
    files: ["apps/mobile/**/*.{ts,tsx}"],
    ignores: [
      "apps/mobile/src/features/account/account-storage.ts",
      "apps/mobile/src/features/push/push-registration.ts",
      "apps/mobile/src/theme/preference-context.tsx",
      "apps/mobile/test/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression']:matches([callee.property.name='setItemAsync'], [callee.property.value='setItemAsync'])",
          message: SET_ITEM_MESSAGE,
        },
        {
          selector:
            "ImportDeclaration[source.value='expo-secure-store'] > ImportSpecifier[imported.name='setItemAsync']",
          message: SET_ITEM_MESSAGE,
        },
      ],
    },
  },

  // Config files and Expo config plugins legitimately use CommonJS require().
  {
    files: ["**/*.config.{js,cjs}", "apps/mobile/plugins/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Disable stylistic rules that conflict with Prettier. Keep last.
  prettier,
);
