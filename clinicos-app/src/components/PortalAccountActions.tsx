"use client";

import { useState } from "react";
import { IcAlert } from "./Icons";
import { appPath } from "@/lib/base-path";
import type { Lang } from "@/lib/terms";
import { errorText, wordsFor } from "@/lib/portal-words";

/** Sign out, or delete the account — typed DELETE, as anything that cannot be
 *  undone asks for. */
export default function PortalAccountActions({ lang }: { lang: Lang }) {
  const w = wordsFor(lang);
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
      setError(errorText(w, data));
      setBusy(false);
      return;
    }
    window.location.assign(appPath("/p"));
  }

  return (
    <div style={{ marginTop: 24 }} lang={lang}>
      <div className="btnrow">
        <button type="button" className="ghost" onClick={signOut} disabled={busy}>
          {w.signOut}
        </button>
        {!deleting && (
          <button type="button" className="quiet" onClick={() => setDeleting(true)} disabled={busy}>
            {w.deleteAsk}
          </button>
        )}
      </div>
      {deleting && (
        <div className="danger" style={{ marginTop: 16 }}>
          <div className="danger-hd">{w.deleteTitle}</div>
          <div className="danger-bd">
            <p className="muted" style={{ marginTop: 0 }}>{w.deleteText}</p>
            <div className="field">
              <label htmlFor="pp-del">{w.typeDelete}</label>
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
                {w.deleteTitle}
              </button>
              <button type="button" className="quiet" onClick={() => setDeleting(false)} disabled={busy}>
                {w.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
