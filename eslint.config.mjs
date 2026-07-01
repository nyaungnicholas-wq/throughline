import tseslint from "typescript-eslint";

/* Flat config via typescript-eslint directly. We deliberately avoid wrapping
   eslint-config-next through FlatCompat — under ESLint 9 that combination throws
   a "Converting circular structure to JSON" error and no rules load at all. */
export default tseslint.config(
  { ignores: [".next/**", "drizzle/**", ".data/**", "node_modules/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    /* TENANT-ISOLATION GUARDRAIL.
       The raw getDb() handle is unscoped — it can read/write across every org.
       UI/route code must go through the tenant-scoped helpers in lib/authz so no
       query can ever forget its org_id filter. Only the auth/authz spine,
       migrations and seed scripts may touch the raw handle. */
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              importNames: ["getDb"],
              message:
                "Do not use the raw getDb() in UI/route code. Use the tenant-scoped helpers from @/lib/authz (requireMember / getMemberContext) so org_id is always enforced.",
            },
          ],
        },
      ],
    },
  },
);
