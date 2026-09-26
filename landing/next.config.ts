import type { NextConfig } from "next";
import { APP_PATH, CLINIC_APP_ORIGIN } from "./src/site";

// The landing site is deliberately standalone: no database, no API routes, no
// access to anything in ../clinicos-app. Nothing deployed from here can reach
// patient data, which is the whole reason it is a separate app.
const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,

  // The site never needs a camera, microphone or location, so it says so and no
  // embedded content can ask. The referrer policy sends only the origin, not the
  // full URL, when someone clicks through to the contact form.
  async headers() {
    return [
      {
        // Everything except /app, which is the clinic app passed through from its
        // own project and sends its own headers. This rule must not reach it:
        // "microphone=()" here would switch off recording consultations.
        source: "/((?!app$|app/).*)",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },

  // The clinic app lives at /app on this address. See APP_PATH in src/site.ts.
  async rewrites() {
    return [
      { source: APP_PATH, destination: `${CLINIC_APP_ORIGIN}${APP_PATH}` },
      { source: `${APP_PATH}/:path*`, destination: `${CLINIC_APP_ORIGIN}${APP_PATH}/:path*` },
    ];
  },
};

export default nextConfig;
