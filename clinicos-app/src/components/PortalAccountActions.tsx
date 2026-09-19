"use client";

import { useState } from "react";
import { IcAlert } from "./Icons";
import { appPath } from "@/lib/base-path";

/** Sign out, or delete the account — typed DELETE, as anything that cannot be
 *  undone asks for. */
export default function PortalAccountActions() {
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setBusy(true);
    await fetch(appPath("/api/portal/logout"), { method: "POST" });
    window.location.assign(appPath("/p"));
  }

  async function remove() {
    setBusy(true);
    setError("");
    const res = await fetch(appPath("/api/portal/account/delete"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: typed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "That didn't work. Try again.");
      setBusy(false);
      return;
    }
    window.location.assign(appPath("/p"));
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div className="btnrow">
        <button type="button" className="ghost" onClick={signOut} disabled={busy}>
          Sign out
        </button>
        {!deleting && (
          <button type="button" className="quiet" onClick={() => setDeleting(true)} disabled={busy}>
            Delete my account…
          </button>
        )}
      </div>
      {deleting && (
        <div className="danger" style={{ marginTop: 16 }}>
          <div className="danger-hd">Delete my account</div>
          <div className="danger-bd">
            <p className="muted" style={{ marginTop: 0 }}>
              Your PIN goes, and every prescription leaves this list. Your clinics keep their own records, as the law
              requires. A code from a prescription can start a new account later.
            </p>
            <div className="field">
              <label htmlFor="pp-del">Type DELETE to confirm</label>
              <input id="pp-del" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
            {error && (
              <div className="note err" role="alert">
                <IcAlert size={16} />
                <span>{error}</span>
              </div>
            )}
            <div className="btnrow">
              <button type="button" className="ghost danger-btn" onClick={remove} disabled={busy || typed.trim().toUpperCase() !== "DELETE"}>
                Delete my account
              </button>
              <button type="button" className="quiet" onClick={() => setDeleting(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
