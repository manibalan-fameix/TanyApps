import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    "workers/jarvis/ui/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    ".next-e2e-cabs/**",
    ".next-e2e-login/**",
    ".open-next/**",
    ".wrangler/**",
    ".local-uploads/**",
    "test-results/**",
    "playwright-report/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // eslint-plugin-react@7 auto-detection calls an API removed in ESLint 10; pin the version.
  { settings: { react: { version: "19.2" } } },
  // Tenant isolation: the raw, unscoped DB client is off-limits to app code.
  // Use scopedDb(dealerId) from "@/lib/db/scoped". Allowed only in the layers below.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}", "proxy.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db/client", "**/db/client.*"],
              message: "Use scopedDb(dealerId) from @/lib/db/scoped. The raw client is for lib/db, lib/auth, lib/tenant, workers, scripts and tests only.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
