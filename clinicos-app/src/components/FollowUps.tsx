"use client";

import { useState } from "react";
import { appPath } from "@/lib/base-path";
import { dayLabel, recallText, waLink } from "@/lib/recall";
import { IcAlert, IcCalendar, IcCheck } from "./Icons";

export type DueRow = {
  consultId: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  followUpOn: string;
  doctorName: string | null;
};

/**
 * Patients asked back by a doctor, whose day has come, who have not been back
 * (backlog #10). Message on WhatsApp opens WhatsApp with the reminder typed in;
 * the desk presses send there. Never a diagnosis, here or in the message.
 */
export default function FollowUps({
  initial,
  today,
  clinicName,
  template,
}: {
  initial: DueRow[];
  today: string;
  clinicName: string;
  template: string;
}) {
  const [rows, setRows] = useState(initial);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function record(r: DueRow, action: "messaged" | "dismissed") {
    setError("");
    try {
      const res = await fetch(appPath(`/api/followups/${r.consultId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
      setRows((all) => all.filter((x) => x.consultId !== r.consultId));
      setNotice(action === "messaged" ? `Marked ${r.patientName} as messaged.` : `${r.patientName} taken off the list.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const dueToday = rows.filter((r) => r.followUpOn === today);
  const overdue = rows.filter((r) => r.followUpOn < today);

  return (
    <>
      <div className="stats">
        <div className="stat hero">
          <div className="k">Due today</div>
          <div className="v">{dueToday.length}</div>
          <div className="n">asked back for today</div>
        </div>
        <div className="stat">
          <div className="k">Overdue</div>
          <div className="v">{overdue.length}</div>
          <div className="n">not back yet</div>
        </div>
      </div>

      {notice && (
        <div className="note ok" role="status">
          <IcCheck size={17} />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="note err" role="alert">
          <IcAlert size={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="card flush">
        <div className="card-head">
          <span className="title">Asked to come back</span>
          <span className="muted">oldest first</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty">
            <IcCalendar size={26} />
            <div className="big" style={{ marginTop: 10 }}>No follow-ups are due.</div>
            <div>A patient appears here on the date their doctor wrote, until they are back or you have messaged them.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="queue">
              <thead>
                <tr>
                  <th>Due</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const link = waLink(
                    r.patientPhone,
                    recallText(template, { name: r.patientName, clinic: clinicName, doctor: r.doctorName, date: r.followUpOn })
                  );
                  return (
                    <tr key={r.consultId}>
                      <td className="nowrap">
                        {r.followUpOn === today ? <span className="pill draft">Today</span> : <span>{dayLabel(r.followUpOn)}</span>}
                      </td>
                      <td>
                        <span className="nm">{r.patientName}</span>
                        <div className="dim sub">{r.patientPhone || "No phone number on file"}</div>
                      </td>
                      <td className="dim">{r.doctorName ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <div className="row-actions">
                          {link && (
                            <a
                              className="wa-link"
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => void record(r, "messaged")}
                            >
                              Message on WhatsApp<span className="visually-hidden"> — {r.patientName}</span>
                            </a>
                          )}
                          <button type="button" className="quiet small" onClick={() => void record(r, "dismissed")}>
                            Not needed<span className="visually-hidden"> — {r.patientName}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="muted">
        WhatsApp opens with the reminder typed in; press send there. ClinicOS sends nothing itself. When the patient comes
        back and is put on the day&apos;s list, they leave this list by themselves.
      </p>
    </>
  );
}
