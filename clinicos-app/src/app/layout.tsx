import type { Metadata } from "next";
import "./globals.css";
import SideNav from "@/components/SideNav";

export const metadata: Metadata = {
  title: "ClinicOS",
  description: "AI operating system for Indian clinics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <SideNav />
          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
