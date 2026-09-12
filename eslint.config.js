import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // `eslint .` used to run for over eight minutes and never finish, because it
    // walks these: 40MB of embedded-Postgres files from the db tests, the build
    // output, and two large generated sources. Nobody runs a linter that never
    // returns -- which is how a rules-of-hooks error reached production on a
    // page that then crashed for every visitor.
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      ".vercel",
      ".wrangler",
      ".tanstack",
      ".pgdata",
      ".lovable",
      // Generated, and each one says so in its first line. Linting a file we
      // must not edit only produces findings nobody may act on.
      "src/routeTree.gen.ts",
      "src/integrations/supabase/types.ts",
      "src/integrations/supabase/client.ts",
      "src/integrations/supabase/client.server.ts",
      "src/integrations/supabase/auth-middleware.ts",
      "src/integrations/supabase/auth-attacher.ts",
      "src/integrations/supabase/previewAuthStorage.ts",
      "src/routes/mcp.ts",
      "src/routes/[.well-known]/oauth-protected-resource.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
