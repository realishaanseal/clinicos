import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Online the app is served at vxclinicos.vercel.app/app, behind the website
  // (see src/lib/base-path.ts). On the clinic computer this is unset and the
  // app stays at the root.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
};

export default nextConfig;
