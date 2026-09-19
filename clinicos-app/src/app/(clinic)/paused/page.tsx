import Link from "next/link";
import { redirect } from "next/navigation";
import { can, homeFor, requireUser } from "@/lib/auth";
import { IcShield } from "@/components/Icons";

export const dynamic = "force-dynamic";

/** Where a paused clinic's doctors and front desk land. Nothing clinical is
 *  shown; anyone who manages the clinic is pointed at the export. */
export default async function PausedPage() {
  const user = await requireUser();
  if (user.clinicStatus !== "suspended") redirect(homeFor(user));

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="eyebrow">ClinicOS</div>
        <h1>Paused for this clinic</h1>
        <p className="sub">Consultations and the day&apos;s list are switched off until Varaxis switches them back on.</p>
      </div>
      <div className="note info">
        <IcShield size={17} />
        <span>
          <strong>Nothing has been deleted.</strong> Every patient, visit and prescription is kept exactly as it was.
          {can(user, "admin") ? (
            <>
              {" "}
              You can still <Link href="/admin">export everything from Clinic admin</Link>.
            </>
          ) : (
            " Whoever manages the clinic can still export everything."
          )}
        </span>
      </div>
    </div>
  );
}
