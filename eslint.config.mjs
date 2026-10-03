import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Auto-generated Prisma client — never hand-edited, not our lint surface.
    "src/generated/**",
    // Agent Manager / Kilo tooling state. `.kilo/worktrees/*` holds full
    // duplicate checkouts of this repo, so linting it both doubles the run
    // and reports the same findings twice from a different config root.
    ".kilo/**",
  ]),
  // Allow explicit `any` in test files for mocking/typing convenience
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "vitest.setup.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
