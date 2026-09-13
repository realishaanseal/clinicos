import { redirect } from "next/navigation";
import { countPatients, countUsers } from "@/lib/db";
import SetupForm from "@/components/SetupForm";
import { Mark } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (countUsers() > 0) redirect("/login");

  // An upgraded prototype already has its clinic and doctor in .env; start
  // from those rather than making someone type them again.
  const envClinic = process.env.CLINIC_NAME;
  const envDoctor = process.env.DOCTOR_NAME;
  const defaults = {
    clinicName: envClinic && envClinic !== "Demo Clinic" ? envClinic : "",
    name: envDoctor && envDoctor !== "Dr. Demo" ? envDoctor : "",
    qualification: process.env.DOCTOR_QUALIFICATION || "",
    regNo: process.env.DOCTOR_REGNO || "",
  };
  const existingPatients = countPatients();

  return (
    <main className="auth">
      <div className="auth-card wide">
        <div className="auth-brand">
          <span className="mark">
            <Mark size={21} />
          </span>
          <div>
            <div className="name">ClinicOS</div>
            <div className="tag">First-time setup</div>
          </div>
        </div>
        <h1>Set up ClinicOS</h1>
        <p className="sub">
          Create the first account. It can add doctors and front-desk staff afterwards.
          {existingPatients > 0 &&
            ` The ${existingPatients} patient record${existingPatients === 1 ? "" : "s"} already on this computer stay exactly as they are.`}
        </p>
        <SetupForm defaults={defaults} />
      </div>
      <p className="auth-foot">Everything you enter here stays on this computer.</p>
    </main>
  );
}
