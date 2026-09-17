"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IcShield, IcDownload, IcAlert, IcCheck } from "./Icons";
import { fmt } from "@/lib/time";
import { appPath } from "@/lib/base-path";

type BackupFile = { name: string; bytes: number; createdAt: string; auto: boolean };

const kb = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export default function BackupPanel({
  backups,
  lastBackupAt,
}: {
  backups: BackupFile[];
  lastBackupAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [typed, setTyped] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const ageDays = lastBackupAt
    ? Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86400000)
    : null;
  const stale = ageDays === null || ageDays >= 7;

  async function backupNow() {
    setBusy("Creating backup…");
    setError("");
    setMsg(null);
    try {
      const res = await fetch(appPath("/api/backup/create"), { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`Backup created — ${data.name} (${kb(data.bytes)}).`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doRestore() {
    if (!file || typed.trim().toUpperCase() !== "RESTORE") return;
    setBusy("Restoring…");
    setError("");
    setMsg(null);
    try {
      const form = new FormData();
      form.append("backup", file);
      form.append("confirm", typed);
      const res = await fetch(appPath("/api/backup/restore"), { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Restore failed");
      setMsg(
        `Restored — ${data.counts.patients} patients, ${data.counts.consults} consultations. ` +
          `Your previous data was saved as ${data.safetyCopy} in case this was a mistake. ` +
          `Accounts come from the backup as well, so everyone needs to sign in again. ` +
          `Restart ClinicOS to be certain everything is reading the new database.`
      );
      setRestoreOpen(false);
      setFile(null);
      setTyped("");
      // No router.refresh() here. The restore replaced the sessions too, so a
      // refresh would jump straight to the sign-in page before anyone could
      // read the message above.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="card flush">
        <div className="card-head">
          <span className="title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IcShield size={16} /> Backup
          </span>
          {lastBackupAt ? (
            <span className={`saveflag`} data-state={stale ? "error" : "saved"}>
              {stale ? <IcAlert size={13} /> : <IcCheck size={13} />}
              last backup{" "}
              {ageDays === 0 ? "today" : ageDays === 1 ? "yesterday" : `${ageDays} days ago`}
            </span>
          ) : (
            <span className="saveflag" data-state="error">
              <IcAlert size={13} /> never backed up
            </span>
          )}
        </div>

        <div className="card-body">
          {stale && (
            <div className="note info" style={{ marginTop: 0 }}>
              <IcAlert size={17} />
              <span>
                <strong>No recent backup.</strong> Every patient record in this clinic lives in one file
                on one laptop. Download a copy now and keep it somewhere else — a pen drive, a different
                machine, anywhere that is not this computer.
              </span>
            </div>
          )}

          {msg && (
            <div className="note ok">
              <IcCheck size={17} />
              <span>{msg}</span>
            </div>
          )}
          {error && (
            <div className="note err">
              <IcAlert size={17} />
              <span>{error}</span>
            </div>
          )}

          <p className="muted" style={{ marginTop: 0 }}>
            ClinicOS makes an automatic backup once a day and keeps the last 14. Those still live on this
            laptop, so they do not help if the laptop is lost — download one regularly.
          </p>

          <div className="btnrow">
            <a href={appPath("/api/backup/download")} download>
              <button type="button">
                <IcDownload size={15} /> Download backup now
              </button>
            </a>
            <button className="ghost" onClick={backupNow} disabled={!!busy} type="button">
              {busy === "Creating backup…" ? "Working…" : "Save a backup on this machine"}
            </button>
            <a href={appPath("/api/backup/export")} download>
              <button className="ghost" type="button">
                Export everything as JSON
              </button>
            </a>
          </div>

          <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>
            The backup is an ordinary SQLite file — openable by any database tool, with or without
            ClinicOS. The JSON export is readable in any text editor. Neither locks you in.
          </p>
        </div>

        {backups.length > 0 && (
          <>
            <div className="card-head" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <span className="title">On this machine</span>
              <span className="muted">{backups.length} kept</span>
            </div>
            <div>
              {backups.slice(0, 8).map((b) => (
                <div className="delrow" key={b.name}>
                  <div>
                    <span className="mono" style={{ fontSize: 12.5 }}>{b.name}</span>
                    <span className="dim" style={{ marginLeft: 10, fontSize: 12.5 }}>
                      {kb(b.bytes)} · {fmt(new Date(b.createdAt))}
                      {b.auto && " · automatic"}
                    </span>
                  </div>
                  <a href={appPath(`/api/backup/download?name=${encodeURIComponent(b.name)}`)} download>
                    <button className="ghost small" type="button">
                      <IcDownload size={14} /> Download
                    </button>
                  </a>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------ restore */}
      <div className="danger">
        <div className="danger-hd">
          <IcAlert size={17} /> Restore from a backup
        </div>
        <div className="danger-bd">
          <div className="note info" style={{ marginTop: 0 }}>
            <IcAlert size={17} />
            <span>
              Restoring <strong>replaces everything currently in ClinicOS</strong> with the contents of
              the backup file. Any consultation recorded since that backup was taken will be gone.
              ClinicOS saves a copy of your current data first, so a mistake here is recoverable — but
              do not do this casually. Accounts and passwords are restored along with the records; if the
              backup is older than accounts, your own account is kept so you can still sign in.
            </span>
          </div>

          {!restoreOpen ? (
            <button className="ghost danger-btn" onClick={() => setRestoreOpen(true)} type="button">
              Restore from a backup file
            </button>
          ) : (
            <>
              <div className="field">
                <label>Backup file (.db)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".db,application/x-sqlite3,application/octet-stream"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file && (
                  <p className="muted" style={{ marginTop: 6 }}>
                    {file.name} · {kb(file.size)}
                  </p>
                )}
              </div>

              <div className="field">
                <label>
                  Type <span className="typename">RESTORE</span> to confirm
                </label>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className={
                    typed && typed.trim().toUpperCase() !== "RESTORE"
                      ? "bad"
                      : typed.trim().toUpperCase() === "RESTORE"
                      ? "good"
                      : ""
                  }
                />
              </div>

              <div className="btnrow">
                <button
                  className="destroy"
                  onClick={doRestore}
                  disabled={!file || typed.trim().toUpperCase() !== "RESTORE" || !!busy}
                  type="button"
                >
                  {busy === "Restoring…" ? "Restoring…" : "Replace all data with this backup"}
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    setRestoreOpen(false);
                    setFile(null);
                    setTyped("");
                  }}
                  disabled={!!busy}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
