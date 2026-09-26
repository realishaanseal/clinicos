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
import { IcDoc, IcArrow, IcAlert, IcCalendar } from "@/components/Icons";
import LinkHint from "@/components/LinkHint";
import { requireUser } from "@/lib/auth";
import { clinicDayAt, fmt, fmtDate, fmtTime } from "@/lib/time";
import { getBillingSettings, getClinicName } from "@/lib/clinic";
import { daySummaryText } from "@/lib/day-summary";
import { waMessageLink } from "@/lib/recall";
import { owedTotal } from "@/lib/db";
import { ONLINE } from "@/lib/deployment";

export const dynamic = "force-dynamic";

/**
 * Everything both halves of Today need about the day: the money, the clinic's
 * name and the follow-ups due now and tomorrow. Counts and money; never a
 * patient.
 *
 * Asked in one go rather than one after another. On a clinic computer the
 * database answers in the same process and the order hardly matters; online
 * each of these is its own trip to Mumbai, and Today is the screen a clinic
 * opens most.
 */
async function dayNumbers(clinicId: ClinicId) {
  const today = localDay();
  const tomorrow = localDay(clinicDayAt(1));
  const [billing, clinicName, collected, owed, dueTomorrow, dueNow] = await Promise.all([
    getBillingSettings(clinicId),
    getClinicName(clinicId),
    takingsOn(clinicId, today),
    owedTotal(clinicId),
    followUpsDue(clinicId, tomorrow, tomorrow),
    followUpsDue(clinicId, today, localDay(clinicDayAt(-RECALL_DAYS))),
  ]);
  return { today, billing, clinicName, collected, owed, dueTomorrow, dueNow };
}

type DayNumbers = Awaited<ReturnType<typeof dayNumbers>>;

/** The day in one message for whoever runs the clinic (backlog #13), and what
 *  the follow-up list is worth (#11). */
function dayInOneMessage(day: DayNumbers, queue: QueueRow[]) {
  const text = daySummaryText({
    clinicName: day.clinicName,
    day: day.today,
    seen: queue.filter((r) => r.status === "done").length,
    waiting: queue.filter((r) => r.status === "waiting" || r.status === "with-doctor").length,
    collected: day.collected,
    owed: day.owed,
    followUpsTomorrow: day.dueTomorrow.length,
  });
  return { text, link: waMessageLink(day.billing.ownerPhone, text) };
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
    const [queue, day] = await Promise.all([todaysQueue(user.clinicId), dayNumbers(user.clinicId)]);
    const summary = dayInOneMessage(day, queue);
    return (
      <div className="page">
        <div className="page-head">
          <div className="eyebrow">{today}</div>
          <h1>Today</h1>
          <p className="sub">Find or register patients, and keep the day&apos;s list moving.</p>
        </div>
        <FrontDeskToday initial={queue} collectedPaise={day.collected.total} followUpsDue={day.dueNow.length} />
        <DaySummary text={summary.text} link={summary.link} />
      </div>
    );
  }

  // The doctor's Today: every question at once rather than eleven in a row.
  const [queue, day, consults, unfinished, numbers] = await Promise.all([
    todaysQueue(user.clinicId),
    dayNumbers(user.clinicId),
    recentConsults(user.clinicId, 20),
    unfinishedConsults(user.clinicId),
    clinicNumbers(user.clinicId),
  ]);
  const summary = dayInOneMessage(day, queue);
  const dueNow = day.dueNow.length;
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

      {dueNow > 0 && (
        <div className="note info" role="note">
          <IcCalendar size={17} />
          <span>
            {dueNow} patient{dueNow === 1 ? " you asked" : "s you asked"} back {dueNow === 1 ? "has" : "have"} not been
            in. <Link href="/followups">Open Follow-ups →<LinkHint /></Link>
          </span>
        </div>
      )}

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
                <button className="ghost small">
                  Resume
                  <LinkHint />
                </button>
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
            <LinkHint />
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
                      <Link href={`/patients/${c.patientId}`}>
                        {c.patient.name}
                        <LinkHint />
                      </Link>
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
                        <LinkHint />
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
