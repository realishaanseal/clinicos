"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IcUsers, IcArrow } from "./Icons";
import AddToQueueButton from "./AddToQueueButton";
import DeletePatientButton from "./DeletePatientButton";
import LinkHint from "./LinkHint";
import { appPath } from "@/lib/base-path";
import { ONLINE } from "@/lib/deployment";

export type PatientHit = {
  id: string;
  name: string;
  age: number | null;
  phone: string | null;
  consultCount: number;
};

/** What searchPatients returns at a time, and what the list says when it is full. */
const PAGE = 50;

/**
 * Finding a patient, as the desk types (backlog #8).
 *
 * The list arrives with the page, server-rendered, so it is there before any
 * JavaScript runs and the form still works without it. With JavaScript, each
 * pause in typing asks /api/patients instead of reloading the whole screen:
 * the desk is doing this with somebody standing in front of them, and a page
 * reload per search meant the field lost focus and the caret jumped.
 *
 * A slower answer to an older search is thrown away rather than drawn over a
 * newer one — the same rule as Ctrl+K.
 */
export default function PatientSearch({
  initial,
  initialQuery,
  canOpen,
  isAdmin,
}: {
  initial: PatientHit[];
  initialQuery: string;
  canOpen: boolean;
  isAdmin: boolean;
}) {
  const [q, setQ] = useState(initialQuery);
  const [rows, setRows] = useState(initial);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  // The first render must show exactly what the server sent, or React
  // complains and the list flickers; only later changes go to the network.
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const term = q.trim();
    const ctl = new AbortController();
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(appPath(`/api/patients?q=${encodeURIComponent(term)}`), { signal: ctl.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setRows(data.patients as PatientHit[]);
        setFailed(false);
        // Keep the address bar honest, so a refresh or a shared link finds the
        // same people — without a navigation, which would reload the screen.
        const url = term ? `${appPath("/patients")}?q=${encodeURIComponent(term)}` : appPath("/patients");
        window.history.replaceState(null, "", url);
      } catch (e) {
        // Aborted because a newer search started: leave the list alone.
        if ((e as Error)?.name !== "AbortError") setFailed(true);
      } finally {
        if (!ctl.signal.aborted) setSearching(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  return (
    <>
      <p className="sub" style={{ marginTop: -20, marginBottom: 22 }}>
        {rows.length} record{rows.length === 1 ? "" : "s"}
        {ONLINE ? "." : " on this machine."}
        {!q.trim() && rows.length === PAGE && ` Showing the ${PAGE} most recently registered — search to find anyone else.`}
        {!!q.trim() && rows.length === PAGE && ` Showing the first ${PAGE} matches — narrow the search to find someone else.`}
      </p>

      {/* Still a real form: without JavaScript, Enter reloads the page with
          ?q= and the server renders the same list. */}
      <form className="card" style={{ padding: 14 }} onSubmit={(e) => e.preventDefault()}>
        <input
          name="q"
          type="search"
          value={q}
          onChange={(e) => {
            typed.current = true;
            setQ(e.target.value);
          }}
          placeholder="Search by name or phone number…"
          aria-label="Search patients by name or phone number"
          autoComplete="off"
        />
      </form>

      {failed && (
        <div className="note err" role="alert">
          The search could not reach ClinicOS. The list below may be out of date — try again in a moment.
        </div>
      )}

      <div className={`card flush${searching ? " searching" : ""}`} aria-busy={searching}>
        {rows.length === 0 ? (
          <div className="empty">
            <IcUsers size={26} />
            <div className="big" style={{ marginTop: 10 }}>
              {q.trim() ? "Nobody matches that search" : "No patients yet"}
            </div>
            <div>
              {q.trim()
                ? "Try part of the name, or the last few digits of their phone number."
                : canOpen
                ? "Start a consultation from Today."
                : "Register the first patient from Today."}
            </div>
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
              {rows.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 580 }}>
                    {canOpen ? (
                      <Link href={`/patients/${p.id}`}>
                        {p.name}
                        <LinkHint />
                      </Link>
                    ) : (
                      p.name
                    )}
                  </td>
                  <td className="dim">{p.age ?? "—"}</td>
                  <td className="dim">{p.phone || "—"}</td>
                  <td className="dim">{p.consultCount}</td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      {(isAdmin || p.consultCount === 0) && (
                        <DeletePatientButton patient={{ id: p.id, name: p.name, consultCount: p.consultCount }} />
                      )}
                      {canOpen ? (
                        <Link href={`/patients/${p.id}`} aria-label={`Open ${p.name}`}>
                          <IcArrow size={16} />
                        </Link>
                      ) : (
                        <AddToQueueButton patientId={p.id} name={p.name} />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
