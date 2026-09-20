import {
  unfinishedConsults,
  recentConsults,
  clinicNumbers,
  minutesSavedFrom,
  todaysQueue,
  takingsOn,
  type ClinicId,
  type QueueRow,
  followUpsDue,
  localDay,
  RECALL_DAYS,
} from "@/lib/db";
import NewPatient from "@/components/NewPatient";
import DaySummary from "@/components/DaySummary";
import FrontDeskToday from "@/components/FrontDeskToday";
import WaitingPanel from "@/components/WaitingPanel";
import Link from "next/link";
import { parseNote } from "@/lib/types";
import { IcDoc, IcArrow, IcAlert } from "@/components/Icons";
import { requireUser } from "@/lib/auth";
import { clinicDayAt, fmt, fmtDate, fmtTime } from "@/lib/time";
import { getBillingSettings, getClinicName } from "@/lib/clinic";
import { daySummaryText } from "@/lib/day-summary";
import { waMessageLink } from "@/lib/recall";
import { owedTotal } from "@/lib/db";
import { ONLINE } from "@/lib/deployment";

export const dynamic = "force-dynamic";

/**
 * The day in one message for whoever runs the clinic (backlog #13), and what
 * the follow-up list is worth (#11). Counts and money; never a patient.
 */
async function dayInOneMessage(user: { clinicId: ClinicId }, queue: QueueRow[]) {
  const today = localDay();
  const { ownerPhone } = await getBillingSettings(user.clinicId);
  const text = daySummaryText({
    clinicName: await getClinicName(user.clinicId),
    day: today,
    seen: queue.filter((r) => r.status === "done").length,
    waiting: queue.filter((r) => r.status === "waiting" || r.status === "with-doctor").length,
    collected: await takingsOn(user.clinicId, today),
    owed: await owedTotal(user.clinicId),
    followUpsTomorrow: (await followUpsDue(user.clinicId, localDay(clinicDayAt(1)), localDay(clinicDayAt(1)))).length,
  });
  return { text, link: waMessageLink(ownerPhone, text) };
}

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
    const queue = await todaysQueue(user.clinicId);
    const summary = await dayInOneMessage(user, queue);
    return (
      <div className="page">
        <div className="page-head">
          <div className="eyebrow">{today}</div>
          <h1>Today</h1>
          <p className="sub">Find or register patients, and keep the day&apos;s list moving.</p>
        </div>
        <FrontDeskToday
          initial={queue}
          collectedPaise={(await takingsOn(user.clinicId, localDay())).total}
          followUpsDue={(await followUpsDue(user.clinicId, localDay(), localDay(clinicDayAt(-RECALL_DAYS)))).length}
        />
        <DaySummary text={summary.text} link={summary.link} />
      </div>
    );
  }

  const queue = await todaysQueue(user.clinicId);
  const summary = await dayInOneMessage(user, queue);
  const consults = await recentConsults(user.clinicId, 20);
  const unfinished = await unfinishedConsults(user.clinicId);
  const numbers = await clinicNumbers(user.clinicId);
  // Per AI-drafted note: a note written by hand had no draft to correct.
  const editsPerNote = numbers.drafted ? (numbers.edits / numbers.drafted).toFixed(1) : "—";
  const saved = minutesSavedFrom(numbers);

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
          <div className="v">{numbers.consultsToday}</div>
          <div className="n">{numbers.signed} signed all time</div>
        </div>
        <div className="stat">
          <div className="k">Patients</div>
          <div className="v">{numbers.patients}</div>
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

      <WaitingPanel initial={queue} doctorId={user.id} />

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

      <DaySummary text={summary.text} link={summary.link} />

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
