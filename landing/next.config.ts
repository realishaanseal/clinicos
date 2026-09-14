import type { NextConfig } from "next";

// The landing site is deliberately standalone: no database, no API routes, no
// access to anything in ../clinicos-app. Nothing deployed from here can reach
// patient data, which is the whole reason it is a separate app.
const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,

  // The site never needs a camera, microphone or location, so it says so and
  // no embedded content can ask. The referrer policy sends only the origin, not
  // the full URL, when someone clicks through to the contact form.
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
      {
        // The backdrop's frames, posters and tables live under a versioned folder
        // (/backdrop/v2/). A new film gets a new folder, so these can be cached for
        // a year without anyone ever being served a stale one.
        source: "/backdrop/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
