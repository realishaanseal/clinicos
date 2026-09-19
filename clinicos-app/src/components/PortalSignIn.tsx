"use client";

import { useEffect, useState } from "react";
import { IcAlert } from "./Icons";
import { appPath } from "@/lib/base-path";

/**
 * Patient sign-in. With a PIN, or — the first time, or when the PIN is
 * forgotten — with the code printed on a prescription, choosing a new PIN.
 * The QR code on a prescription carries the code after "#", which a browser
 * never sends to a server, and it is filled in here.
 */
export default function PortalSignIn() {
  const [withCode, setWithCode] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const m = /code=([A-Za-z0-9-]+)/.exec(window.location.hash);
    if (m) {
      setWithCode(true);
      setCode(m[1].toUpperCase());
      // Out of the address bar, so it is not left in the phone's history.
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (withCode && pin !== pin2) {
      setError("The two PINs don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(withCode ? appPath("/api/portal/start") : appPath("/api/portal/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withCode ? { phone, code, pin } : { phone, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
      window.location.assign(appPath(data.redirect || "/p"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="pp-phone">Phone number · ফোন নম্বর</label>
        <input
          id="pp-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          autoFocus
        />
      </div>
      {withCode && (
        <div className="field">
          <label htmlFor="pp-code">Code on your prescription · প্রেসক্রিপশনের কোড</label>
          <input
            id="pp-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7QF-2MXP-9D"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>
      )}
      <div className={withCode ? "grid" : ""}>
        <div className="field">
          <label htmlFor="pp-pin">{withCode ? "Choose a 6-digit PIN · নতুন পিন" : "PIN · পিন"}</label>
          <input
            id="pp-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete={withCode ? "new-password" : "current-password"}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            required
          />
        </div>
        {withCode && (
          <div className="field">
            <label htmlFor="pp-pin2">The same PIN again</label>
            <input
              id="pp-pin2"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="new-password"
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
        )}
      </div>

      {error && (
        <div className="note err" role="alert">
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" className="wide" disabled={busy}>
        {busy ? "Opening…" : withCode ? "Set PIN and open" : "Open my prescriptions"}
      </button>
      <p className="muted" style={{ marginBottom: 0, textAlign: "center" }}>
        <button type="button" className="quiet small" onClick={() => { setWithCode(!withCode); setError(""); }}>
          {withCode ? "I have a PIN already" : "First time here, or forgot your PIN? Use the code on your prescription"}
        </button>
      </p>
    </form>
  );
}
