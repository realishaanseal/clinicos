import type { Metadata, Viewport } from "next";
import "./globals.css";
import Backdrop from "@/components/Backdrop";
import SiteHeader from "@/components/SiteHeader";
import SmoothScroll from "@/components/SmoothScroll";
import ScrollProgress from "@/components/ScrollProgress";
import StaggerGroups from "@/components/StaggerGroups";
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
    "Local-first clinical documentation for clinics and hospitals. The note is drafted from the consultation already taking place, and patient data never leaves your hardware. A Varaxis product.",
  openGraph: {
    title: "ClinicOS — clinical documentation that writes itself",
    description:
      "The consultation already happened. The record should too. Local-first clinical documentation, from a single-room practice to a hospital department.",
    type: "website",
    siteName: "ClinicOS",
  },
};

// The browser's own chrome, the address bar on phones, matches the film's near-black.
export const viewport: Viewport = {
  themeColor: "#010604",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        {/* The film sits behind the whole document and is scrubbed by scroll position. */}
        <Backdrop />
        <SmoothScroll />
        <ScrollProgress />
        <StaggerGroups />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
