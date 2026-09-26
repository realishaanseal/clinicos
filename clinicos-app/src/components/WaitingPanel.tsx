"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QueueRow } from "@/lib/db";
import { elapsed, useQueue } from "@/lib/useQueue";
import { IcAlert, IcArrow } from "./Icons";
import { appPath } from "@/lib/base-path";
import LinkHint from "./LinkHint";

/**
 * The doctor's view of today's list: who is waiting, and a button that calls
 * the next patient in and opens their consultation.
 */
export default function WaitingPanel({ initial, doctorId }: { initial: QueueRow[]; doctorId: string }) {
  const router = useRouter();
  const { rows, refresh, stale } = useQueue(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const mine = rows.filter((r) => r.status === "with-doctor" && r.calledBy === doctorId);
  const waiting = rows.filter((r) => r.status === "waiting");

  async function start(r: QueueRow) {
    setBusyId(r.id);
    setError("");
    try {
      const res = await fetch(appPath(`/api/queue/${r.id}/start`), { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't start the visit.");
      router.push(`/consult/${data.consultId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusyId(null);
      refresh();
    }
  }

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">Waiting now</span>
        {stale ? (
          <span className="saveflag" data-state="error">
            <IcAlert size={13} /> list may be out of date
          </span>
        ) : (
          <span className="muted">{waiting.length} waiting</span>
        )}
      </div>

      {error && (
        <div className="note err" role="alert" style={{ margin: "12px 20px" }}>
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {mine.map((r) => (
        <div className="waiting-row mine" key={r.id}>
          <span className="token">{r.token}</span>
          <div className="who">
            <strong>{r.patientName}</strong>
            <span className="dim"> · with you for {elapsed(r.calledAt)}</span>
          </div>
          <Link href={`/consult/${r.consultId}`} className="muted" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            Continue <IcArrow size={14} />
            <LinkHint />
          </Link>
        </div>
      ))}

      {waiting.length === 0 && mine.length === 0 ? (
        <div className="waiting-row">
          <span className="muted">Nobody waiting. Patients the front desk adds to today&apos;s list appear here.</span>
        </div>
      ) : (
        waiting.map((r, i) => (
          <div className="waiting-row" key={r.id}>
            <span className="token">{r.token}</span>
            <div className="who">
              <strong>{r.patientName}</strong>
              <span className="dim">
                {/* Age and sex only when recorded; an empty "—" between two
                    dots read like a missing field rather than no field. */}
                {[r.patientAge !== null ? `${r.patientAge}` : null, r.patientSex].filter(Boolean).length > 0 &&
                  ` · ${[r.patientAge !== null ? `${r.patientAge}` : null, r.patientSex].filter(Boolean).join(" ")}`}
                {" · waiting "}
                <span suppressHydrationWarning>{elapsed(r.addedAt)}</span>
              </span>
            </div>
            <button
              type="button"
              className={i === 0 ? "small" : "ghost small"}
              onClick={() => start(r)}
              disabled={busyId !== null}
            >
              {busyId === r.id ? "Starting…" : "Start visit"}
              <span className="visually-hidden"> with {r.patientName}</span>
            </button>
          </div>
        ))
      )}
    </div>
  );
}
