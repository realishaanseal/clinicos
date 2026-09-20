import { getPatient, consultsForPatient } from "@/lib/db";
import { notFound } from "next/navigation";
import { parseNote } from "@/lib/types";
import Link from "next/link";
import NewConsultButton from "@/components/NewConsultButton";
import { IcDoc, IcArrow } from "@/components/Icons";
import { can, requireUser } from "@/lib/auth";
import DeletePatientButton from "@/components/DeletePatientButton";
import { fmtDate } from "@/lib/time";
import { dayLabel } from "@/lib/recall";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("clinical");

  const { id } = await params;
  const patient = await getPatient(user.clinicId, id);
  if (!patient) notFound();
  const consults = await consultsForPatient(user.clinicId, id);
  const signed = consults.filter((c) => c.signedAt);
  // What the doctor needs before the patient sits down (backlog #24): what was
  // written at the last signed visit. Said as that, not as "current
  // medicines" — whether the patient is still taking them is not ours to claim.
  const last = signed[0];
  const lastNote = last ? parseNote(last.finalJson) : null;
  const lastMeds = lastNote?.medications.filter((m) => m.name.trim()) ?? [];

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

      {last && lastNote && (
        <div className="card flush">
          <div className="card-head">
            <span className="title">Last visit, at a glance</span>
            <span className="muted">
              {fmtDate(new Date(last.signedAt!), { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
          <div className="card-body">
            {lastNote.diagnosis && <p style={{ margin: "0 0 10px", fontWeight: 580 }}>{lastNote.diagnosis}</p>}
            <span className="field-label">Medicines given then</span>
            {lastMeds.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>None were prescribed.</p>
            ) : (
              <ul className="glance-meds">
                {lastMeds.map((m, i) => (
                  <li key={i}>
                    <strong>{m.name}</strong>{" "}
                    <span className="dim">{[m.dose, m.frequency, m.duration, m.instructions].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
            {last.followUpOn && (
              <p className="muted" style={{ margin: "10px 0 0" }}>
                Asked back on <strong>{dayLabel(last.followUpOn, { day: "numeric", month: "long", year: "numeric" })}</strong>
                {lastNote.followUp ? ` — ${lastNote.followUp}` : ""}
              </p>
            )}
            {lastNote.returnIf?.trim() && (
              <p className="muted" style={{ margin: "6px 0 0" }}>Warning signs given: {lastNote.returnIf}</p>
            )}
          </div>
        </div>
      )}

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
                      {c.draftJson
                        ? `${c.editCount} correction${c.editCount === 1 ? "" : "s"} to the AI draft`
                        : "Written by hand"}
                      {c.audioDeletedAt && " · audio deleted"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(can(user, "admin") || consults.length === 0) && (
        <div className="danger" style={{ marginTop: 28 }}>
          <div className="danger-hd">Delete this patient</div>
          <div className="danger-bd">
            <p className="muted" style={{ marginTop: 0 }}>
              {consults.length === 0
                ? "Registered by mistake, or a duplicate? With no visits, the record can be deleted outright."
                : "This deletes every visit, note and prescription for this patient, with no undo. Export the record first if it may be needed."}
            </p>
            <DeletePatientButton
              patient={{ id: patient.id, name: patient.name, consultCount: consults.length }}
              afterHref="/patients"
              label="Delete this patient"
            />
          </div>
        </div>
      )}
    </div>
  );
}
