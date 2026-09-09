import { searchPatients } from "@/lib/db";
import Link from "next/link";
import { IcUsers, IcArrow } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
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
            <div>{q ? "Try a shorter search." : "Start a consultation from Today."}</div>
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
                    <Link href={`/patients/${p.id}`}>{p.name}</Link>
                  </td>
                  <td className="dim">{p.age ?? "—"}</td>
                  <td className="dim">{p.phone || "—"}</td>
                  <td className="dim">{p.consultCount}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/patients/${p.id}`} aria-label={`Open ${p.name}`}>
                      <IcArrow size={16} />
                    </Link>
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
