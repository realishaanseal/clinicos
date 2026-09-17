"use client";

import { useState } from "react";
import { IcTrash, IcAlert } from "./Icons";
import { appPath } from "@/lib/base-path";

export type DeletablePatient = { id: string; name: string; consultCount: number };

export type DeletionResult = {
  patientName: string;
  consultsDeleted: number;
  editsDeleted: number;
  audioDeleted: number;
};

/**
 * Type-to-confirm deletion of one patient.
 *
 * The name must be retyped in full before the delete button becomes live.
 * Two people have to agree it's the right record: the one who opened the
 * dialog, and the one who typed the name. Used from Clinic admin, the patient
 * list and a patient's own page; the server decides who may delete what.
 */
export default function DeletePatientDialog({
  patient,
  onClose,
  onDeleted,
}: {
  patient: DeletablePatient;
  onClose: () => void;
  onDeleted: (result: DeletionResult) => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const matches = norm(typed) === norm(patient.name);

  async function confirmDelete() {
    if (!matches) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(appPath(`/api/patients/${patient.id}`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Deletion failed");
      onDeleted(data as DeletionResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const empty = patient.consultCount === 0;

  return (
    <div className="modal-back" onClick={() => !busy && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <IcAlert size={18} /> Permanently delete this record?
        </div>
        <div className="modal-bd">
          {empty ? (
            <p style={{ marginTop: 0 }}>
              This will delete <strong>{patient.name}</strong>. They have no consultations, so only their
              registration details and any place on today&apos;s list go with them.
            </p>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>
                This will delete <strong>{patient.name}</strong>, all {patient.consultCount} consultation
                {patient.consultCount === 1 ? "" : "s"}, every clinical note and prescription, the edit
                history, and any recording still stored.
              </p>
              <p className="muted">
                <a href={appPath(`/api/patients/${patient.id}/export`)} download>
                  Export this record first
                </a>{" "}
                if you may ever need it. Once deleted it cannot be recovered from within ClinicOS.
              </p>
            </>
          )}

          {error && (
            <div className="note err">
              <IcAlert size={17} />
              <span>{error}</span>
            </div>
          )}

          <label style={{ marginTop: 18 }}>
            Type <span className="typename">{patient.name}</span> to confirm
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={patient.name}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className={typed && !matches ? "bad" : matches ? "good" : ""}
          />
          {typed && !matches && (
            <p className="muted" style={{ marginTop: 6 }}>
              Doesn&apos;t match yet.
            </p>
          )}
        </div>
        <div className="modal-ft">
          <button className="ghost" onClick={onClose} disabled={busy} type="button">
            Cancel
          </button>
          <button className="destroy" onClick={confirmDelete} disabled={!matches || busy} type="button">
            <IcTrash size={15} /> {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
