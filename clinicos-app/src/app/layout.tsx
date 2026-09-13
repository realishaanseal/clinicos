import type { Metadata } from "next";
import "./globals.css";
import SideNav from "@/components/SideNav";
import { getCurrentUser } from "@/lib/auth";
import { getClinic } from "@/lib/clinic";
import { maybeAutoBackup } from "@/lib/backup";

export const metadata: Metadata = {
  title: "ClinicOS",
  description: "AI operating system for Indian clinics",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // Sign-in and setup pages render without the app shell.
  if (!user) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  // Lazy daily backup. Cheap when a recent one exists, and it cannot be
  // "switched off" by accident the way a separate scheduler can. It runs here,
  // for every signed-in page, so it happens whichever role uses the app that day.
  await maybeAutoBackup();

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <SideNav
            user={{ name: user.name, role: user.role, isAdmin: user.isAdmin }}
            clinicName={getClinic().name}
          />
          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
