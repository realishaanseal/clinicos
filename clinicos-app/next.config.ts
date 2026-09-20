import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],

  /**
   * Headers for every page and route of the clinic app, on a clinic computer
   * and online alike (the website leaves /app alone so these are what a clinic
   * gets — see landing/next.config.ts).
   *
   * microphone is deliberately allowed for this app itself: switching it off
   * would stop consultations being recorded. Everything else is closed.
   * A clinic's records are nobody's search result, so nothing here is indexed.
   */
  async headers() {
    const csp = [
      "default-src 'self'",
      // Next's hydration needs inline script and style; nothing is loaded from
      // anywhere else, and the app ships no third-party script at all.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), interest-cohort=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  // Online the app is served at vxclinicos.vercel.app/app, behind the website
  // (see src/lib/base-path.ts). On the clinic computer this is unset and the
  // app stays at the root.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
};

export default nextConfig;
