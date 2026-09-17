"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcTrash, IcAlert, IcDownload, IcCheck } from "./Icons";
import { appPath } from "@/lib/base-path";
import DeletePatientDialog, { type DeletablePatient, type DeletionResult } from "./DeletePatientDialog";

/**
 * Clinic admin's list of every patient, each with Export and Delete. The
 * confirmation itself lives in DeletePatientDialog, shared with the patient
 * list and a patient's own page.
 */
export default function DeletePatient({ patients }: { patients: DeletablePatient[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<DeletablePatient | null>(null);
  const [done, setDone] = useState<string | null>(null);

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

        {patients.length === 0 ? (
          <p className="muted">No patients yet.</p>
        ) : (
          <div className="dellist">
            {patients.map((p) => (
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
