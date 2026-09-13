import {
  unfinishedConsults,
  recentConsults,
  countEdits,
  countSignedConsults,
  countPatients,
  countConsultsToday,
  minutesSaved,
} from "@/lib/db";
import NewPatient from "@/components/NewPatient";
import Link from "next/link";
import { parseNote } from "@/lib/types";
import { IcDoc, IcArrow, IcAlert } from "@/components/Icons";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Today lists diagnoses, so it is a clinical page. Staff and non-clinical
  // admins are sent to their own home instead.
  await requireUser("clinical");

  const consults = recentConsults(20);
  const unfinished = unfinishedConsults();
  const signed = countSignedConsults();
  const edits = countEdits();
  const editsPerNote = signed ? (edits / signed).toFixed(1) : "—";
  const saved = minutesSaved();

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">{today}</div>
        <h1>Today</h1>
        <p className="sub">Start a consultation, or pick up one you left in progress.</p>
      </div>

      <div className="stats">
        <div className="stat hero">
          <div className="k">Consultations today</div>
          <div className="v">{countConsultsToday()}</div>
          <div className="n">{signed} signed all time</div>
        </div>
        <div className="stat">
          <div className="k">Patients</div>
          <div className="v">{countPatients()}</div>
          <div className="n">on this machine</div>
        </div>
        <div className="stat">
          <div className="k">Edits per note</div>
          <div className="v">{editsPerNote}</div>
          <div className="n">lower is better — watch the trend</div>
        </div>
        <div className="stat">
          <div className="k">Time saved</div>
          <div className="v">
            {saved >= 60 ? `${Math.floor(saved / 60)}h` : saved}
            <span style={{ fontSize: 17, fontWeight: 550 }}>{saved >= 60 ? `${saved % 60}m` : "m"}</span>
          </div>
          <div className="n">at 4 min per note</div>
        </div>
      </div>

      {unfinished.length > 0 && (
        <div className="card flush resume">
          <div className="card-head">
            <span className="title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <IcAlert size={16} /> Unfinished consultations
            </span>
            <span className="muted">nothing here has been lost</span>
          </div>
          {unfinished.map((c) => (
            <div className="resume-row" key={c.id}>
              <div>
                <strong>{c.patient.name}</strong>
                <span className="dim" style={{ marginLeft: 8, fontSize: 13 }}>
                  {new Date(c.createdAt).toLocaleString("en-IN", {
                    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
                  })}
                </span>
                <div className="why">{c.reason}</div>
              </div>
              <Link href={`/consult/${c.id}`}>
                <button className="ghost small">Resume</button>
              </Link>
            </div>
          ))}
        </div>
      )}

      <NewPatient />

      <div className="card flush">
        <div className="card-head">
          <span className="title">Recent consultations</span>
          <Link href="/patients" className="muted">
            All patients →
          </Link>
        </div>

        {consults.length === 0 ? (
          <div className="empty">
            <IcDoc size={26} />
            <div className="big" style={{ marginTop: 10 }}>No consultations yet</div>
            <div>Add a patient above to start the first one.</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>When</th>
                <th>Diagnosis</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {consults.map((c) => {
                const n = parseNote(c.finalJson || c.draftJson);
                const d = new Date(c.createdAt);
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 580 }}>
                      <Link href={`/patients/${c.patientId}`}>{c.patient.name}</Link>
                      {c.patient.age !== null && <span className="dim" style={{ fontWeight: 400 }}> · {c.patient.age}</span>}
                    </td>
                    <td className="dim">
                      {d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      <span style={{ opacity: 0.6 }}>
                        {" "}
                        {d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </td>
                    <td>{n.diagnosis || <span className="dim">—</span>}</td>
                    <td>
                      <span className={`pill ${c.signedAt ? "signed" : "draft"}`}>
                        {c.signedAt ? "Signed" : "In progress"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/consult/${c.id}`} aria-label="Open consultation">
                        <IcArrow size={16} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
