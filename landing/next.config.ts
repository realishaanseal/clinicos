import type { NextConfig } from "next";

// The landing site is deliberately standalone: no database, no API routes, no
// access to anything in ../clinicos-app. Nothing deployed from here can reach
// patient data, which is the whole reason it is a separate app.
const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
