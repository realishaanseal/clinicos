import type { Metadata, Viewport } from "next";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import { SITE_URL } from "@/site";

export const metadata: Metadata = {
  // Share previews need absolute image URLs; this is what they resolve against.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ClinicOS — clinical documentation that writes itself",
    template: "%s — ClinicOS",
  },
  twitter: { card: "summary_large_image" },
  description:
    "Clinical documentation for clinics and hospitals. The note is drafted from the consultation already taking place. Run it on your own hardware, online, or both. A Varaxis product.",
  openGraph: {
    title: "ClinicOS — clinical documentation that writes itself",
    description:
      "The consultation already happened. The record should too. Local-first clinical documentation, from a single-room practice to a hospital department.",
    type: "website",
    siteName: "ClinicOS",
  },
};

// The browser's own chrome, and the address bar on phones, match the page.
export const viewport: Viewport = {
  themeColor: "#f7f9f8",
};

/**
 * The whole site's shell. Three elements: a skip link, the header, the page.
 *
 * Nothing else. The previous version mounted a canvas backdrop, a smooth-scroll
 * driver, a scroll-progress bar and a stagger controller here, all of them
 * client components running on every route. This layout ships no JavaScript of
 * its own at all.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
