"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { QueueRow } from "@/lib/db";
import { elapsed, useQueue } from "@/lib/useQueue";
import NewPatient from "./NewPatient";
import { IcAlert, IcCalendar, IcCheck, IcUsers } from "./Icons";
import { fmtTime } from "@/lib/time";
import { appPath } from "@/lib/base-path";
import { formatPaise } from "@/lib/money";
import LinkHint from "./LinkHint";

type Found = { id: string; name: string; age: number | null; sex: string | null; phone: string | null; consultCount: number };

/**
 * The front desk's Today: find or register a patient, put them on the list,
 * and watch the list move. No clinical information appears anywhere here.
 */
export default function FrontDeskToday({
  initial,
  collectedPaise,
  followUpsDue,
}: {
  initial: QueueRow[];
  /** Taken at the desk today, cancelled bills aside. As of when the page opened. */
  collectedPaise: number;
  followUpsDue: number;
}) {
  const { rows, refresh, stale } = useQueue(initial);
  const [notice, setNotice] = useState<string | null>(null);

  const active = rows.filter((r) => r.status === "waiting" || r.status === "with-doctor");
  const finished = rows.filter((r) => r.status === "done" || r.status === "left");
  const waiting = rows.filter((r) => r.status === "waiting").length;
  const withDoctor = rows.filter((r) => r.status === "with-doctor").length;
  const seen = rows.filter((r) => r.status === "done").length;

  function queued(message: string) {
    setNotice(message);
    refresh();
  }

  return (
    <>
      <div className="stats">
        <div className="stat hero">
          <div className="k">Waiting</div>
          <div className="v">{waiting}</div>
          <div className="n">on today&apos;s list</div>
        </div>
        <div className="stat">
          <div className="k">With a doctor</div>
          <div className="v">{withDoctor}</div>
          <div className="n">right now</div>
        </div>
        <div className="stat">
          <div className="k">Seen today</div>
          <div className="v">{seen}</div>
          <div className="n">consultation signed</div>
        </div>
        <Link href="/bills" className="stat stat-link">
          <div className="k">Collected today</div>
          <div className="v">{formatPaise(collectedPaise)}</div>
          <div className="n">open Bills →</div>
        </Link>
      </div>

      {followUpsDue > 0 && (
        <div className="note info" role="note">
          <IcCalendar size={17} />
          <span>
            {followUpsDue} patient{followUpsDue === 1 ? " is" : "s are"} due a follow-up and {followUpsDue === 1 ? "hasn't" : "haven't"} been
            back. <Link href="/followups">Open Follow-ups →<LinkHint /></Link>
          </span>
        </div>
      )}

      {notice && (
        <div className="note ok" role="status">
          <IcCheck size={17} />
          <span>{notice}</span>
        </div>
      )}

      <div className="fd-grid">
        <FindPatient onQueued={queued} />
        <NewPatient mode="queue" onQueued={queued} />
      </div>

      <QueueTable title="Today's list" rows={active} onChange={refresh} stale={stale} empty="Nobody is waiting." />
      {finished.length > 0 && <QueueTable title="Finished today" rows={finished} onChange={refresh} />}
    </>
  );
}

function FindPatient({ onQueued }: { onQueued: (message: string) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setFound(null);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(appPath(`/api/patients?q=${encodeURIComponent(term)}`), { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Search failed");
        setFound(data.patients);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 250);
  }, [q]);

  async function add(p: Found) {
    setBusyId(p.id);
    setError("");
    try {
      const res = await fetch(appPath("/api/queue"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't add them to the list.");
      onQueued(
        data.alreadyQueued
          ? `${p.name} is already on today's list as token ${data.entry.token}.`
          : `${p.name} added to today's list as token ${data.entry.token}.`
      );
      setQ("");
      setFound(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">Find a returning patient</span>
      </div>
      <div className="card-body" style={{ paddingBottom: found ? 0 : undefined }}>
        <label htmlFor="fd-search">Name or phone number</label>
        <input
          id="fd-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Rina Das, or 98300 12345"
          autoComplete="off"
          autoFocus
        />
        {error && (
          <div className="note err" role="alert">
            <IcAlert size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>
      {found && (
        <div className="results" aria-live="polite">
          {found.length === 0 ? (
            <div className="result-row">
              <span className="muted">Nobody on file matches. Register them as a new patient.</span>
            </div>
          ) : (
            found.slice(0, 8).map((p) => (
              <div className="result-row" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <span className="dim" style={{ marginLeft: 8, fontSize: 13 }}>
                    {[p.age !== null ? `${p.age}` : null, p.sex, p.phone].filter(Boolean).join(" · ")}
                  </span>
                  <div className="dim" style={{ fontSize: 12.5 }}>
                    {p.consultCount} earlier visit{p.consultCount === 1 ? "" : "s"}
                  </div>
                </div>
                <button type="button" className="ghost small" onClick={() => add(p)} disabled={busyId !== null}>
                  {busyId === p.id ? "Adding…" : "Add to today's list"}
                  <span className="visually-hidden"> {p.name}</span>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function QueueTable({
  title,
  rows,
  onChange,
  stale = false,
  empty,
}: {
  title: string;
  rows: QueueRow[];
  onChange: () => void;
  stale?: boolean;
  empty?: string;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function markLeft(r: QueueRow) {
    setBusyId(r.id);
    setError("");
    try {
      const res = await fetch(appPath(`/api/queue/${r.id}/left`), { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work.");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">{title}</span>
        {stale && (
          <span className="saveflag" data-state="error">
            <IcAlert size={13} /> can&apos;t reach ClinicOS — list may be out of date
          </span>
        )}
      </div>
      {error && (
        <div className="note err" role="alert" style={{ margin: "12px 20px" }}>
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="empty">
          <IcUsers size={26} />
          <div className="big" style={{ marginTop: 10 }}>{empty}</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="queue">
            <thead>
              <tr>
                <th>Token</th>
                <th>Patient</th>
                <th>Status</th>
                <th>Since</th>
                <th><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.status === "done" || r.status === "left" ? "finished" : ""}>
                  <td><span className="token">{r.token}</span></td>
                  <td>
                    <span className="nm">{r.patientName}</span>
                    <div className="dim sub">
                      {[r.patientAge !== null ? `${r.patientAge}` : null, r.patientSex, r.patientPhone].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td>
                    {r.status === "waiting" && <span className="pill draft">Waiting</span>}
                    {r.status === "with-doctor" && <span className="pill signed">With {r.calledByName ?? "doctor"}</span>}
                    {r.status === "done" && <span className="pill off">Seen</span>}
                    {r.status === "left" && <span className="pill off">Left without being seen</span>}
                  </td>
                  <td className="dim nowrap" suppressHydrationWarning>
                    {r.status === "waiting" && elapsed(r.addedAt)}
                    {r.status === "with-doctor" && elapsed(r.calledAt)}
                    {(r.status === "done" || r.status === "left") &&
                      (r.doneAt ? fmtTime(new Date(r.doneAt), { hour: "numeric", minute: "2-digit" }) : "")}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row-actions">
                      {r.status !== "left" && (
                        <Link href={`/bills?patient=${r.patientId}`} className="button-link">
                          Bill<span className="visually-hidden"> {r.patientName}</span>
                        </Link>
                      )}
                      {r.status === "waiting" && (
                        <button type="button" className="ghost small" onClick={() => markLeft(r)} disabled={busyId !== null}>
                          {busyId === r.id ? "Saving…" : "Left"}
                          <span className="visually-hidden"> — {r.patientName} went home without being seen</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
