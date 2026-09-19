import {
  unfinishedConsults,
  recentConsults,
  countEdits,
  countSignedConsults,
  countDraftedSignedConsults,
  countPatients,
  countConsultsToday,
  minutesSaved,
  todaysQueue,
} from "@/lib/db";
import NewPatient from "@/components/NewPatient";
import FrontDeskToday from "@/components/FrontDeskToday";
import WaitingPanel from "@/components/WaitingPanel";
import Link from "next/link";
import { parseNote } from "@/lib/types";
import { IcDoc, IcArrow, IcAlert } from "@/components/Icons";
import { requireUser } from "@/lib/auth";
import { fmt, fmtDate, fmtTime } from "@/lib/time";
import { ONLINE } from "@/lib/deployment";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser("frontdesk");

  const today = fmtDate(new Date(), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // The front desk's Today. It returns before a single clinical query runs,
  // so nothing clinical can leak into this render by accident.
  if (user.role !== "doctor") {
    return (
      <div className="page">
        <div className="page-head">
          <div className="eyebrow">{today}</div>
          <h1>Today</h1>
          <p className="sub">Find or register patients, and keep the day&apos;s list moving.</p>
        </div>
        <FrontDeskToday initial={await todaysQueue(user.clinicId)} />
      </div>
    );
  }

  const consults = await recentConsults(user.clinicId, 20);
  const unfinished = await unfinishedConsults(user.clinicId);
  const signed = await countSignedConsults(user.clinicId);
  const drafted = await countDraftedSignedConsults(user.clinicId);
  const edits = await countEdits(user.clinicId);
  // Per AI-drafted note: a note written by hand had no draft to correct.
  const editsPerNote = drafted ? (edits / drafted).toFixed(1) : "—";
  const saved = await minutesSaved(user.clinicId);

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
          <div className="v">{await countConsultsToday(user.clinicId)}</div>
          <div className="n">{signed} signed all time</div>
        </div>
        <div className="stat">
          <div className="k">Patients</div>
          <div className="v">{await countPatients(user.clinicId)}</div>
          <div className="n">{ONLINE ? "in the online copy" : "on this machine"}</div>
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
          <div className="n">at 4 min per AI-drafted note</div>
        </div>
      </div>

      <WaitingPanel initial={await todaysQueue(user.clinicId)} doctorId={user.id} />

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
                  {fmt(new Date(c.createdAt), {
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
                      {fmtDate(d, { day: "numeric", month: "short" })}
                      <span style={{ opacity: 0.6 }}>
                        {" "}
                        {fmtTime(d, { hour: "numeric", minute: "2-digit" })}
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
