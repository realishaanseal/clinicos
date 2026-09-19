import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClinicOS",
  description: "AI operating system for Indian clinics",
};

/**
 * The page itself and nothing else. The clinic's screens get their navigation
 * from (clinic)/layout.tsx and the platform console from platform/layout.tsx;
 * sign-in and setup stand alone. Kept apart so that someone signed in to a
 * clinic never sees the clinic's navigation around a Varaxis page, or the
 * other way round.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
