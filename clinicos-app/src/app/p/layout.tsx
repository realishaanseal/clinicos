import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PORTAL_ENABLED } from "@/lib/portal";

export const metadata: Metadata = {
  title: "Your prescriptions · ClinicOS",
  description: "Prescriptions your doctor has shared with you.",
  // A patient's list of prescriptions is nobody's search result.
  robots: { index: false, follow: false },
};

/** The patient portal: only online. A clinic computer has no portal. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  if (!PORTAL_ENABLED) notFound();
  return <div className="portal">{children}</div>;
}
