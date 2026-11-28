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

  // A path param is client input, and a malformed one must read as "not found",
  // not reach Postgres and 500 (#51, #252). Read each through a schema from
  // routes/params.ts.
  {
    files: ["apps/api/src/routes/**/*.ts"],
    ignores: ["apps/api/src/routes/params.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.property.name='req'][callee.property.name='param']:not(CallExpression[callee.property.name=/^(safeParse|parse)$/][callee.object.name=/ParamSchema$/] > CallExpression)",
          message:
            "Parse path params with uuidParamSchema from routes/params.ts, e.g. uuidParamSchema.safeParse(c.req.param('id')). For an intentionally raw read, add an eslint-disable-next-line comment that says why.",
        },
        {
          selector: "VariableDeclarator[id.name=/ParamSchema$/]",
          message:
            "Declare path param schemas in routes/params.ts and import them; a route file must not define its own *ParamSchema.",
        },
      ],
    },
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
