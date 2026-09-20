import { searchPatients } from "@/lib/db";
import Link from "next/link";
import { IcUsers, IcArrow } from "@/components/Icons";
import AddToQueueButton from "@/components/AddToQueueButton";
import DeletePatientButton from "@/components/DeletePatientButton";
import { ONLINE } from "@/lib/deployment";
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
        <p className="sub">
          {patients.length} record{patients.length === 1 ? "" : "s"}
          {ONLINE ? "." : " on this machine."}
          {!q && patients.length === 50 && " Showing the 50 most recently registered — search to find anyone else."}
          {q && patients.length === 50 && " Showing the first 50 matches — narrow the search to find someone else."}
        </p>
      </div>

      <form className="card" style={{ padding: 14 }}>
        <input
          name="q"
          type="search"
          defaultValue={q || ""}
          placeholder="Search by name or phone number…"
          aria-label="Search patients by name or phone number"
        />
      </form>

      <div className="card flush">
        {patients.length === 0 ? (
          <div className="empty">
            <IcUsers size={26} />
            <div className="big" style={{ marginTop: 10 }}>
              {q ? "Nobody matches that search" : "No patients yet"}
            </div>
            <div>
              {q
                ? "Try part of the name, or the last few digits of their phone number."
                : canOpen
                ? "Start a consultation from Today."
                : "Register the first patient from Today."}
            </div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Age</th>
                <th>Phone</th>
                <th>Visits</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 580 }}>
                    {canOpen ? <Link href={`/patients/${p.id}`}>{p.name}</Link> : p.name}
                  </td>
                  <td className="dim">{p.age ?? "—"}</td>
                  <td className="dim">{p.phone || "—"}</td>
                  <td className="dim">{p.consultCount}</td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      {(isAdmin || p.consultCount === 0) && (
                        <DeletePatientButton patient={{ id: p.id, name: p.name, consultCount: p.consultCount }} />
                      )}
                      {canOpen ? (
                        <Link href={`/patients/${p.id}`} aria-label={`Open ${p.name}`}>
                          <IcArrow size={16} />
                        </Link>
                      ) : (
                        <AddToQueueButton patientId={p.id} name={p.name} />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
