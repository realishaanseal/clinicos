"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcTrash, IcAlert, IcDownload, IcCheck } from "./Icons";

type P = { id: string; name: string; consultCount: number };

/**
 * Type-to-confirm deletion.
 *
 * The name must be retyped in full before the delete button becomes live.
 * Two people have to agree it's the right record: the one who opened the
 * dialog, and the one who typed the name.
 */
export default function DeletePatient({ patients }: { patients: P[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<P | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const matches = !!target && norm(typed) === norm(target.name);

  function open(p: P) {
    setTarget(p);
    setTyped("");
    setError("");
    setDone(null);
  }

  async function confirmDelete() {
    if (!target || !matches) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/patients/${target.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: typed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion failed");
      setDone(
        `Deleted ${data.patientName} — ${data.consultsDeleted} consultation${
          data.consultsDeleted === 1 ? "" : "s"
        }, ${data.editsDeleted} edit record${data.editsDeleted === 1 ? "" : "s"}${
          data.audioDeleted ? `, ${data.audioDeleted} audio file${data.audioDeleted === 1 ? "" : "s"}` : ""
        }.`
      );
      setTarget(null);
      setTyped("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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
        {error && (
          <div className="note err">
            <IcAlert size={17} />
            <span>{error}</span>
          </div>
        )}

        {patients.length === 0 ? (
          <p className="muted">No patients on this machine.</p>
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
                  <a href={`/api/patients/${p.id}/export`} download>
                    <button className="ghost small" type="button">
                      <IcDownload size={14} /> Export
                    </button>
                  </a>
                  <button className="ghost small danger-btn" onClick={() => open(p)} type="button">
                    <IcTrash size={14} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {target && (
        <div className="modal-back" onClick={() => !busy && setTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <IcAlert size={18} /> Permanently delete this record?
            </div>
            <div className="modal-bd">
              <p style={{ marginTop: 0 }}>
                This will delete <strong>{target.name}</strong>, all {target.consultCount} consultation
                {target.consultCount === 1 ? "" : "s"}, every clinical note and prescription, the edit
                history, and any audio still on disk.
              </p>
              <p className="muted">
                <a href={`/api/patients/${target.id}/export`} download>
                  Export this record first
                </a>{" "}
                if you may ever need it. Once deleted it cannot be recovered from within ClinicOS.
              </p>

              <label style={{ marginTop: 18 }}>
                Type <span className="typename">{target.name}</span> to confirm
              </label>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={target.name}
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
              <button className="ghost" onClick={() => setTarget(null)} disabled={busy} type="button">
                Cancel
              </button>
              <button className="destroy" onClick={confirmDelete} disabled={!matches || busy} type="button">
                <IcTrash size={15} /> {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
