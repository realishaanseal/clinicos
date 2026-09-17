import { getPatient, consultsForPatient } from "@/lib/db";
import { notFound } from "next/navigation";
import { parseNote } from "@/lib/types";
import Link from "next/link";
import NewConsultButton from "@/components/NewConsultButton";
import { IcDoc, IcArrow } from "@/components/Icons";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("clinical");

  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();
  const consults = await consultsForPatient(id);
  const signed = consults.filter((c) => c.signedAt);

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div className="eyebrow">
          <Link href="/patients">Patients</Link> · Record
        </div>
        <h1>{patient.name}</h1>
        <p className="sub">
          {[patient.age !== null ? `${patient.age} years` : null, patient.sex, patient.phone]
            .filter(Boolean).join(" · ") || "No details recorded"}
          {signed.length > 0 && ` · ${signed.length} completed visit${signed.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <NewConsultButton patientId={patient.id} />

      <h2>History</h2>

      {consults.length === 0 ? (
        <div className="card">
          <div className="empty">
            <IcDoc size={26} />
            <div className="big" style={{ marginTop: 10 }}>No visits yet</div>
          </div>
        </div>
      ) : (
        <div className="tl">
          {consults.map((c) => {
            const n = parseNote(c.finalJson || c.draftJson);
            const meds = n.medications.filter((m) => m.name);
            return (
              <div className={`tl-item ${c.signedAt ? "" : "unsigned"}`} key={c.id}>
                <div className="card" style={{ marginBottom: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div>
                      <strong style={{ fontSize: 15 }}>
                        {fmtDate(new Date(c.signedAt || c.createdAt), {
                          day: "numeric", month: "long", year: "numeric",
                        })}
                      </strong>
                      <span className={`pill ${c.signedAt ? "signed" : "draft"}`} style={{ marginLeft: 10 }}>
                        {c.signedAt ? "Signed" : "In progress"}
                      </span>
                    </div>
                    <Link href={`/consult/${c.id}`} className="muted" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {c.signedAt ? "View" : "Continue"} <IcArrow size={14} />
                    </Link>
                  </div>

                  {n.diagnosis && <div style={{ fontWeight: 580, marginBottom: 3 }}>{n.diagnosis}</div>}
                  {n.chiefComplaint && <div className="muted">{n.chiefComplaint}</div>}

                  {meds.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 13.5 }}>
                      {meds.map((m, i) => (
                        <span key={i} style={{ marginRight: 12 }}>
                          <strong>{m.name}</strong> <span className="dim">{[m.dose, m.frequency].filter(Boolean).join(" ")}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {c.signedAt && (
                    <div className="muted" style={{ marginTop: 12, fontSize: 12, color: "var(--slate-400)" }}>
                      {c.editCount} correction{c.editCount === 1 ? "" : "s"} to the AI draft
                      {c.audioDeletedAt && " · audio deleted"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
