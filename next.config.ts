import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/* Content-Security-Policy — defense-in-depth against XSS/exfiltration. Even though the
   app's known XSS sinks are individually fixed, a CSP is the backstop: it forbids loading
   scripts/styles/frames from foreign origins, blocks `connect-src` to anywhere but our own
   origin (so an injected script can't phone home), and disallows framing (clickjacking).
   `'unsafe-inline'` for script/style is required by Next's inline runtime + the no-flash
   theme script; `'unsafe-eval'` is added only in dev for Turbopack HMR. */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "connect-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  /* PGlite ships a WASM bundle and resolves its own assets at runtime. When the
     bundler (Turbopack) processes it, that asset path is handed to Node's fs as a
     URL and throws "path argument must be a string … received URL" on init. Keep
     it external so Node loads it natively and resolves its assets correctly. */
  serverExternalPackages: ["@electric-sql/pglite"],
  /* The Drizzle migration SQL in ./drizzle is read at runtime (process.cwd()/drizzle)
     but isn't imported by code, so file-tracing would drop it from the serverless
     bundle and migrations would ENOENT on Vercel. Force-include it for every route. */
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
