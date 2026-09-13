import { searchPatients } from "@/lib/db";
import Link from "next/link";
import { IcUsers, IcArrow } from "@/components/Icons";
import { can, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser("frontdesk");
  // Front desk can find a patient; only a doctor can open their clinical history.
  const canOpen = can(user, "clinical");

  const { q } = await searchParams;
  const patients = searchPatients(q || "");

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Records</div>
        <h1>Patients</h1>
        <p className="sub">{patients.length} record{patients.length === 1 ? "" : "s"} on this machine.</p>
      </div>

      <form className="card" style={{ padding: 14 }}>
        <input
          name="q"
          defaultValue={q || ""}
          placeholder="Search by name…"
          aria-label="Search patients"
        />
      </form>

      <div className="card flush">
        {patients.length === 0 ? (
          <div className="empty">
            <IcUsers size={26} />
            <div className="big" style={{ marginTop: 10 }}>
              {q ? "No patient by that name" : "No patients yet"}
            </div>
            <div>{q ? "Try a shorter search." : canOpen ? "Start a consultation from Today." : "Nobody has been registered yet."}</div>
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
                    {canOpen && (
                      <Link href={`/patients/${p.id}`} aria-label={`Open ${p.name}`}>
                        <IcArrow size={16} />
                      </Link>
                    )}
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
