"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IcTrash, IcAlert, IcDownload, IcCheck } from "./Icons";
import { appPath } from "@/lib/base-path";
import DeletePatientDialog, { type DeletablePatient, type DeletionResult } from "./DeletePatientDialog";

/**
 * Clinic admin's patients, each with Export and Delete. The list starts with
 * the most recent; searching asks the server, because a clinic with thousands
 * of records cannot be served by a fixed list and an erasure request names
 * someone who may have been registered years ago.
 *
 * The confirmation itself lives in DeletePatientDialog, shared with the patient
 * list and a patient's own page.
 */
export default function DeletePatient({ patients }: { patients: DeletablePatient[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<DeletablePatient | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<DeletablePatient[] | null>(null);
  const [searchError, setSearchError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = term.trim();
    if (q.length < 2) {
      setFound(null);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(appPath(`/api/admin/patients?q=${encodeURIComponent(q)}`), { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Search failed");
        setFound(data.patients);
        setSearchError("");
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : String(e));
      }
    }, 250);
  }, [term]);

  const shown = found ?? patients;

  function deleted(data: DeletionResult) {
    setDone(
      `Deleted ${data.patientName} — ${data.consultsDeleted} consultation${
        data.consultsDeleted === 1 ? "" : "s"
      }, ${data.editsDeleted} edit record${data.editsDeleted === 1 ? "" : "s"}${
        data.audioDeleted ? `, ${data.audioDeleted} recording${data.audioDeleted === 1 ? "" : "s"}` : ""
      }.`
    );
    setTarget(null);
    router.refresh();
  }

  return (
    <div className="danger">
      <div className="danger-hd">
        <IcAlert size={17} /> Delete patient data
      </div>
      <div className="danger-bd">
        <div className="note info" style={{ marginTop: 0 }}>
          <IcAlert size={17} />
          <span>
            <strong>Deletion is permanent and there is no undo.</strong> Clinical records in India carry
            statutory retention periods under the Clinical Establishments rules, so do not delete a real
            patient&apos;s record simply to tidy up. Legitimate reasons: test data from your own
            demos, a duplicate record, or a patient exercising a lawful erasure request. Export first.
          </span>
        </div>

        {done && (
          <div className="note ok">
            <IcCheck size={17} />
            <span>{done}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="del-search">Find a patient</label>
          <input
            id="del-search"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Name, or the last digits of their phone number"
            autoComplete="off"
          />
          <p className="hint">
            {found
              ? `${found.length} match${found.length === 1 ? "" : "es"}.`
              : `Without a search this shows the ${patients.length} most recently registered.`}
          </p>
        </div>

        {searchError && (
          <div className="note err" role="alert">
            <IcAlert size={16} />
            <span>{searchError}</span>
          </div>
        )}

        {shown.length === 0 ? (
          <p className="muted">{found ? "Nobody matches that search." : "No patients yet."}</p>
        ) : (
          <div className="dellist">
            {shown.map((p) => (
              <div className="delrow" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <span className="dim" style={{ marginLeft: 8, fontSize: 13 }}>
                    {p.consultCount} consultation{p.consultCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="btnrow">
                  <a href={appPath(`/api/patients/${p.id}/export`)} download>
                    <button className="ghost small" type="button">
                      <IcDownload size={14} /> Export
                    </button>
                  </a>
                  <button className="ghost small danger-btn" onClick={() => { setDone(null); setTarget(p); }} type="button">
                    <IcTrash size={14} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {target && <DeletePatientDialog patient={target} onClose={() => setTarget(null)} onDeleted={deleted} />}
    </div>
  );
}
