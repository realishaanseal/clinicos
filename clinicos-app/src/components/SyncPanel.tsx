"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcAlert, IcCheck, IcShield } from "./Icons";
import { appPath } from "@/lib/base-path";
import { fmt } from "@/lib/time";
import type { SyncStatus } from "@/lib/sync-client";

/** "just now", "4 min ago", "3 h ago", or a date. */
function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return fmt(iso, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * On a clinic computer: connect it to the clinic's ClinicOS online, and see
 * how the keeping-in-step is going. Only for clinics whose plan includes it;
 * the key made online is what proves that.
 */
export default function SyncPanel({ initial }: { initial: SyncStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [madeUp, setMadeUp] = useState(false);
  const [askMadeUp, setAskMadeUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [confirmStop, setConfirmStop] = useState(false);

  async function send(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status) setStatus(data.status);
      if (!res.ok) {
        if (data.prototype) setAskMadeUp(true);
        throw new Error(data.error || "That didn't work. Try again.");
      }
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function doConnect(e: React.FormEvent) {
    e.preventDefault();
    const data = await send("POST", appPath("/api/admin/sync"), { url, key, madeUpOnly: madeUp });
    if (!data) return;
    setKey("");
    setNote(`Connected to ${data.clinic.name}. The first sync has started and may take a few minutes.`);
    router.refresh();
    const s = await fetch(appPath("/api/admin/sync")).then((r) => r.json()).catch(() => null);
    if (s) setStatus(s);
  }

  async function runNow() {
    const data = await send("POST", appPath("/api/admin/sync/run"));
    if (data) setNote(`Up to date. Sent ${data.report.sent}, fetched ${data.report.fetched}.`);
  }

  async function stop() {
    if (await send("DELETE", appPath("/api/admin/sync"))) {
      setConfirmStop(false);
      router.refresh();
      setStatus({ ...status, connected: false });
    }
  }

  const offset = status.clockOffset ?? 0;

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IcShield size={16} /> ClinicOS online
        </span>
        <span className="muted">{status.connected ? "kept in step" : "not connected"}</span>
      </div>
      <div className="card-body">
        {error && (
          <div className="note err" role="alert">
            <IcAlert size={16} />
            <span>{error}</span>
          </div>
        )}
        {note && (
          <div className="note ok" role="status">
            <IcCheck size={16} />
            <span>{note}</span>
          </div>
        )}

        {!status.connected ? (
          <form onSubmit={doConnect}>
            <p className="muted" style={{ marginTop: 0 }}>
              If your clinic also uses ClinicOS online and its plan includes this computer, connect it here. Patients,
              visits, notes and accounts then stay the same in both places. Recordings never leave the computer they
              were made on, and are deleted when the doctor signs, wherever that is.
            </p>
            <div className="field">
              <label htmlFor="sync-url">Your clinic&apos;s online address</label>
              <input
                id="sync-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://vxclinicos.vercel.app/app/c/your-clinic"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="sync-key">Key for this computer</label>
              <input
                id="sync-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="cos_…"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
              <p className="hint">
                Made online, in Clinic admin → Clinic computers, by whoever manages the clinic. Keep it like a
                password: it opens this clinic&apos;s records.
              </p>
            </div>
            {askMadeUp && (
              <div className="field">
                <label className="check">
                  <input type="checkbox" checked={madeUp} onChange={(e) => setMadeUp(e.target.checked)} /> Every patient
                  on this computer is made up. (ClinicOS online is still a prototype and must not hold real patients.)
                </label>
              </div>
            )}
            <div className="btnrow">
              <button type="submit" disabled={busy}>
                {busy ? "Connecting…" : "Connect"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <dl className="kv">
              <div><dt>Clinic online</dt><dd>{status.clinicName} <span className="dim mono">{status.clinicSlug}</span></dd></div>
              <div><dt>Address</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{status.url}</dd></div>
              <div><dt>This computer</dt><dd>{status.deviceName}</dd></div>
              <div><dt>Last in step</dt><dd>{ago(status.lastOkAt)}</dd></div>
              <div><dt>Not yet sent</dt><dd>{status.unsent === 0 ? "Nothing" : `${status.unsent} change${status.unsent === 1 ? "" : "s"}`}</dd></div>
            </dl>
            {status.prototype && (
              <div className="note info">
                <IcAlert size={16} />
                <span>ClinicOS online is still a prototype. Only made-up patients belong on this computer while it is connected.</span>
              </div>
            )}
            {status.lastError && (
              <div className="note info">
                <IcAlert size={16} />
                <span>
                  Last try {ago(status.lastAttemptAt)}: {status.lastError}
                </span>
              </div>
            )}
            {Math.abs(offset) > 300 && (
              <div className="note info">
                <IcAlert size={16} />
                <span>
                  This computer&apos;s clock is {Math.round(Math.abs(offset) / 60)} minutes {offset > 0 ? "fast" : "slow"}. Set
                  the right time in the computer&apos;s settings: when a record is changed in both places, the later change
                  is kept, and a wrong clock gets that wrong.
                </span>
              </div>
            )}
            {status.waiting > 0 && (
              <p className="muted">Some records are waiting for others to arrive first; they follow on the next sync.</p>
            )}
            {status.conflicts.length > 0 && (
              <details style={{ marginBottom: 14 }}>
                <summary className="muted" style={{ cursor: "pointer" }}>
                  {status.conflicts.length} thing{status.conflicts.length === 1 ? "" : "s"} the last syncs set aside
                </summary>
                <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {status.conflicts.map((c, i) => (
                    <li key={i}>
                      {c.text} <span className="dim">({ago(c.at)})</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="btnrow">
              <button type="button" onClick={runNow} disabled={busy}>
                {busy ? "Syncing…" : "Sync now"}
              </button>
              {!confirmStop ? (
                <button type="button" className="ghost" onClick={() => setConfirmStop(true)} disabled={busy}>
                  Stop keeping in step…
                </button>
              ) : (
                <>
                  <span className="muted">Nothing is deleted in either place. Reconnecting needs a new key.</span>
                  <button type="button" className="ghost danger-btn" onClick={stop} disabled={busy}>
                    Stop
                  </button>
                  <button type="button" className="quiet" onClick={() => setConfirmStop(false)} disabled={busy}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
