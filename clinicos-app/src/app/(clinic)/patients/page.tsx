import { searchPatients } from "@/lib/db";
import PatientSearch from "@/components/PatientSearch";
import { can, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser("frontdesk");
  // Front desk can find a patient and put them on today's list; only a doctor
  // can open their clinical history.
  const canOpen = can(user, "clinical");
  // Anyone here can delete a record registered by mistake, which has no
  // consultations; a record with consultations is an admin's to delete.
  const isAdmin = can(user, "admin");

  const { q } = await searchParams;
  const patients = await searchPatients(user.clinicId, q || "");

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Records</div>
        <h1>Patients</h1>
      </div>

      {/* The first list is rendered here, on the server. Searching from then
          on happens in the browser, so the desk keeps its place in the box. */}
      <PatientSearch
        initial={patients.map((p) => ({
          id: p.id,
          name: p.name,
          age: p.age,
          phone: p.phone,
          consultCount: p.consultCount,
        }))}
        initialQuery={q || ""}
        canOpen={canOpen}
        isAdmin={isAdmin}
      />
    </div>
  );
}
