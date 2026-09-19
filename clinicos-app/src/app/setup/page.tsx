import { redirect } from "next/navigation";
import { FIRST_CLINIC_ID, countPatients, countUsers } from "@/lib/db";
import SetupForm from "@/components/SetupForm";
import { setupCodeRequired } from "@/lib/setup-code";
import { PROTOTYPE, ONLINE } from "@/lib/deployment";
import { Mark } from "@/components/Icons";
import { MULTI_CLINIC, resolveClinic } from "@/lib/tenant";
import ConnectAtSetup from "@/components/ConnectAtSetup";
import { SYNC_CLIENT_ENABLED } from "@/lib/sync-client";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ clinic?: string }> }) {
  const { clinic: slug } = await searchParams;
  const clinic = await resolveClinic(slug);

  if (!clinic) {
    return (
      <main className="auth">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="mark">
              <Mark size={21} />
            </span>
            <div>
              <div className="name">ClinicOS</div>
              <div className="tag">First-time setup</div>
            </div>
          </div>
          <h1>Open your setup link</h1>
          <p className="sub">
            Varaxis sends each clinic its own ClinicOS address and a setup code. Open that address to set your
            clinic up.
          </p>
        </div>
      </main>
    );
  }

  if ((await countUsers(clinic.id)) > 0) redirect(MULTI_CLINIC ? `/login?clinic=${clinic.slug}` : "/login");

  // An upgraded prototype already has its clinic and doctor in .env; start
  // from those rather than making someone type them again. A clinic Varaxis
  // set up starts from the name it was registered under.
  const first = clinic.id === FIRST_CLINIC_ID;
  const envClinic = process.env.CLINIC_NAME;
  const envDoctor = process.env.DOCTOR_NAME;
  const defaults = first
    ? {
        clinicName: envClinic && envClinic !== "Demo Clinic" ? envClinic : "",
        name: envDoctor && envDoctor !== "Dr. Demo" ? envDoctor : "",
        qualification: process.env.DOCTOR_QUALIFICATION || "",
        regNo: process.env.DOCTOR_REGNO || "",
      }
    : { clinicName: clinic.name, name: "", qualification: "", regNo: "" };
  const existingPatients = await countPatients(clinic.id);

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
            ` The ${existingPatients} patient record${existingPatients === 1 ? "" : "s"} already here stay exactly as they are.`}
        </p>
        <SetupForm defaults={defaults} needsCode={setupCodeRequired(clinic)} clinic={MULTI_CLINIC ? clinic.slug : null} />
        {SYNC_CLIENT_ENABLED && <ConnectAtSetup />}
      </div>
      <p className="auth-foot">
        {PROTOTYPE
          ? "This is the online prototype. Use made-up patients only."
          : ONLINE
            ? "Your clinic's records are kept in its own space, which only its own accounts can open."
            : "Everything you enter here stays on this computer."}
      </p>
    </main>
  );
}
