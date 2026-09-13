import type { NextConfig } from "next";

// The landing site is deliberately standalone: no database, no API routes, no
// access to anything in ../clinicos-app. Nothing deployed from here can reach
// patient data, which is the whole reason it is a separate app.
const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,

  // The site never needs a camera, microphone or location, so it says so and
  // no embedded content can ask. The referrer policy sends only the origin, not
  // the full URL, when someone clicks through to the pilot form.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
