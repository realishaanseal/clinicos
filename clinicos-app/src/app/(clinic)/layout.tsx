import SideNav from "@/components/SideNav";
import { getCurrentUser } from "@/lib/auth";
import { getClinicName } from "@/lib/clinic";
import { maybeAutoBackup } from "@/lib/backup";
import { maybeSync } from "@/lib/sync-client";
import { PROTOTYPE } from "@/lib/deployment";

/** The clinic's screens: navigation down the side, the page beside it. */
export default async function ClinicLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // Not signed in: the page's own requireUser() sends them to sign in.
  if (!user) return <>{children}</>;

  // The same idea for a clinic computer that keeps in step with its clinic
  // online: never awaited, so a slow or absent internet never slows a page.
  maybeSync();

  // Lazy daily backup. Cheap when a recent one exists, and it cannot be
  // "switched off" by accident the way a separate scheduler can. It runs here,
  // for every signed-in page, so it happens whichever role uses the app that
  // day — alongside the clinic's name rather than in front of it, so checking
  // the backups folder is not something every page waits for on its own.
  const [, clinicName] = await Promise.all([maybeAutoBackup(), getClinicName(user.clinicId)]);

  return (
    <div className="shell">
      <SideNav user={{ name: user.name, role: user.role, isAdmin: user.isAdmin }} clinicName={clinicName} />
      <div className="main">
        {PROTOTYPE && (
          // Patients have not been told their records are kept online, and the
          // online copy has no backups yet. Until Varaxis switches this off
          // (deployment.ts), it is for trying ClinicOS, not for real patients.
          <div className="prototype-banner" role="note">
            <strong>Online prototype.</strong> Use made-up patients only — real patient details belong on the
            clinic computer until ClinicOS online is ready for them.
          </div>
        )}
        {user.clinicStatus === "suspended" && (
          <div className="prototype-banner" role="note">
            <strong>ClinicOS is paused for this clinic.</strong> Your records are safe and can be exported from Clinic
            admin. Contact Varaxis to switch it back on.
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
