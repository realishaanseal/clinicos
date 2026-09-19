"use client";

import { useState } from "react";
import { IcAlert } from "./Icons";
import { appPath } from "@/lib/base-path";

/**
 * On a new clinic computer, for a clinic that already uses ClinicOS online:
 * fetch the clinic's records and accounts instead of starting a new clinic.
 * Everyone then signs in here with the username and password they use online.
 */
export default function ConnectAtSetup() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [madeUp, setMadeUp] = useState(false);
  const [askMadeUp, setAskMadeUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(appPath("/api/setup/connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, key, madeUpOnly: madeUp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.prototype) setAskMadeUp(true);
        throw new Error(data.error || "That didn't work. Try again.");
      }
      window.location.assign(appPath(data.redirect || "/login"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
        Does this clinic already use ClinicOS online?{" "}
        <button type="button" className="quiet small" onClick={() => setOpen(true)}>
          Connect this computer to it instead
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line-soft)" }}>
      <h2 style={{ marginTop: 0, fontSize: 17 }}>Connect to your clinic online</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        This computer fetches the clinic&apos;s patients, visits and accounts, and keeps in step from then on. Sign in
        here with the same username and password as online.
      </p>
      <div className="field">
        <label htmlFor="cs-url">Your clinic&apos;s online address</label>
        <input
          id="cs-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://vxclinicos.vercel.app/app/c/your-clinic"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="cs-key">Key for this computer</label>
        <input
          id="cs-key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="cos_…"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <p className="hint">Made online in Clinic admin → Clinic computers, by whoever manages the clinic.</p>
      </div>
      {askMadeUp && (
        <div className="field">
          <label className="check">
            <input type="checkbox" checked={madeUp} onChange={(e) => setMadeUp(e.target.checked)} /> I understand
            ClinicOS online is still a prototype, and this computer will hold made-up patients only.
          </label>
        </div>
      )}
      {error && (
        <div className="note err" role="alert">
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}
      <div className="btnrow">
        <button type="submit" disabled={busy}>
          {busy ? "Fetching the clinic's records…" : "Connect and fetch"}
        </button>
        <button type="button" className="quiet" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
