import type { Metadata } from "next";
import "./globals.css";
import Stage from "@/components/Stage";
import SmoothScroll from "@/components/SmoothScroll";
import ScrollProgress from "@/components/ScrollProgress";

export const metadata: Metadata = {
  title: "ClinicOS — clinical documentation that writes itself",
  description:
    "Local-first clinical documentation for clinics and hospitals. The note is drafted from the consultation already taking place, and patient data never leaves your hardware. A Varaxis product.",
  openGraph: {
    title: "ClinicOS — clinical documentation that writes itself",
    description:
      "The consultation already happened. The record should too. Local-first clinical documentation, from a single-room practice to a hospital department.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* The ambient wash and the morphing rig both sit behind the whole
            document and are re-choreographed by scroll position. */}
        <div className="flow" aria-hidden="true"><span /><span /><span /></div>
        <Stage />
        <SmoothScroll />
        <ScrollProgress />
        {children}
      </body>
    </html>
  );
}
