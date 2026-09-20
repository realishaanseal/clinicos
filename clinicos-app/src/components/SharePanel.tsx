"use client";

import { useState } from "react";
import { IcAlert, IcCheck, IcShield } from "./Icons";
import { appPath } from "@/lib/base-path";
import { fmt } from "@/lib/time";

export type ShareState = { sharedAt: string; revokedAt: string | null } | null;

/**
 * After signing: put the prescription online for the patient, in one tap. The
 * patient agrees to the portal's terms themselves, in their own language, the
 * first time they sign in. The code comes back once, to be printed; lost, a
 * new one replaces it.
 */
export default function SharePanel({
  consultId,
  hasPhone,
  initial,
  available,
  unavailableReason,
  onCode,
}: {
  consultId: string;
  hasPhone: boolean;
  initial: ShareState;
  available: boolean;
  unavailableReason: string | null;
  onCode: (portal: { address: string; code: string } | null) => void;
}) {
  const [share, setShare] = useState<ShareState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);

  const live = share && !share.revokedAt;

  async function doShare() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(appPath(`/api/consults/${consultId}/share`), {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
      setCode(data.code);
      setShare({ sharedAt: share && !share.revokedAt ? share.sharedAt : new Date().toISOString(), revokedAt: null });
      onCode({ address: data.portalUrl, code: data.code });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(appPath(`/api/consults/${consultId}/share`), { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
      setShare(share ? { ...share, revokedAt: new Date().toISOString() } : null);
      setCode(null);
      onCode(null);
      setConfirmStop(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card noprint">
      <div className="card-head" style={{ padding: 0, border: "none", marginBottom: 10 }}>
        <span className="title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IcShield size={16} /> The patient&apos;s own copy online
        </span>
        {live && <span className="pill signed">Shared {fmt(share!.sharedAt, { day: "numeric", month: "short" })}</span>}
      </div>

      {error && (
        <div className="note err" role="alert">
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {code && (
        <div className="note ok" role="status">
          <IcCheck size={17} />
          <span>
            Shared. Their code is <span className="secret">{code}</span> — it is now printed at the bottom of the
            prescription, with the address and a QR code. <strong>Print it now:</strong> the code is shown only this once.
          </span>
        </div>
      )}

      {!available ? (
        <p className="muted" style={{ margin: 0 }}>{unavailableReason}</p>
      ) : !hasPhone ? (
        <p className="muted" style={{ margin: 0 }}>
          The patient signs in with their phone number, and none is on record for them. Add it to share this prescription.
        </p>
      ) : live ? (
        <>
          {!code && (
            <p className="muted" style={{ marginTop: 0 }}>
              They open it with their phone number and the code printed on their prescription. Lost the printout?
              Make a new code and print again; the old code stops working.
            </p>
          )}
          <div className="btnrow">
            {!code && (
              <button type="button" className="ghost" onClick={doShare} disabled={busy}>
                New code and reprint
              </button>
            )}
            {confirmStop ? (
              <>
                <span className="muted">They will no longer be able to open it.</span>
                <button type="button" className="ghost danger-btn" onClick={stop} disabled={busy}>
                  Stop sharing
                </button>
                <button type="button" className="quiet" onClick={() => setConfirmStop(false)} disabled={busy}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="quiet" onClick={() => setConfirmStop(true)} disabled={busy}>
                Stop sharing…
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            {share?.revokedAt
              ? `Sharing was stopped ${fmt(share.revokedAt, { day: "numeric", month: "short" })}. You can share it again if the patient asks.`
              : "The patient can keep this prescription on their phone. They open it with their number and the code printed on it, and agree to the terms, in their own language, the first time."}
          </p>
          <button type="button" className="ghost" onClick={doShare} disabled={busy}>
            {busy ? "Sharing…" : "Share with the patient"}
          </button>
        </>
      )}
    </div>
  );
}
